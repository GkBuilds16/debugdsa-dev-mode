import mongoose from 'mongoose';
import Battle from '../../../models/Battle.js';
import BattleSubmission from '../../../models/BattleSubmission.js';
import BattleWorkspace from '../../../models/BattleWorkspace.js';
import CodebaseVersion from '../../../models/CodebaseVersion.js';
import Registration from '../../../models/Registration.js';
import { localFileStorage } from '../../post-codebase/services/localFileStorage.js';
import { endsAt, getBattleState, refreshBattle } from '../services/lifecycle.js';
import { cancelRegistration, createBattle, getCandidateWorkspace, getOwnBattleHistory, isEligible, loadChallengeVersion, publishBattle, registerCandidate, saveBattleWorkspace, submitBattleWorkspace, updateBattle } from '../services/battleService.js';
import { serializeBattle, serializeRegistration, serializeSubmission, serializeWorkspace, publicChallenge } from '../serializers/battleSerializer.js';
import { validateBattleInput } from '../validators/battleInput.js';

export const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });
export const validId = id => mongoose.isValidObjectId(id);

export async function discoverBattles(req, res) {
  const now = new Date(), page = Math.max(1, Number.parseInt(req.query.page, 10) || 1), limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
  const clauses = [{ status: { $nin: ['DRAFT', 'CANCELLED'] }, codebaseVersionId: { $exists: true } }, { $or: [{ eligibleUserIds: { $exists: false } }, { eligibleUserIds: { $size: 0 } }, { eligibleUserIds: req.user.id }] }];
  if (['Easy', 'Medium', 'Hard'].includes(req.query.difficulty)) clauses[0].difficulty = req.query.difficulty;
  if (typeof req.query.language === 'string' && req.query.language.length <= 40) clauses[0].languages = req.query.language;
  if (typeof req.query.q === 'string' && req.query.q.trim()) { const escaped = req.query.q.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); clauses.push({ $or: [{ title: { $regex: escaped, $options: 'i' } }, { description: { $regex: escaped, $options: 'i' } }] }); }
  const category = ['upcoming', 'live', 'completed'].includes(req.query.status) ? req.query.status : '';
  const end = { $add: ['$startsAt', { $multiply: ['$durationMinutes', 60_000] }] };
  if (category === 'upcoming') clauses.push({ startsAt: { $gt: now } });
  if (category === 'live') clauses.push({ $expr: { $and: [{ $lte: ['$startsAt', now] }, { $gt: [end, now] }] } });
  if (category === 'completed') clauses.push({ $expr: { $lte: [end, now] } });
  const filter = { $and: clauses };
  const sorters = { soonest: { startsAt: 1 }, newest: { createdAt: -1 }, capacity: { capacity: 1 } };
  const [result = { rows: [], count: [] }] = await Battle.aggregate([{ $match: filter }, { $sort: sorters[req.query.sort] || sorters.soonest }, { $facet: { rows: [{ $skip: (page - 1) * limit }, { $limit: limit }], count: [{ $count: 'total' }] } }]);
  const rows = [];
  for (const entry of result.rows) {
    const battle = await refreshBattle(entry, now);
    if (battle.status === 'CANCELLED' || !isEligible(battle, req.user.id)) continue;
    const state = getBattleState(battle, now);
    rows.push(serializeBattle(battle, { state }));
  }
  const total = result.count[0]?.total || 0;
  res.json({ success: true, data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function create(req, res) {
  let input; try { input = validateBattleInput(req.body || {}); } catch (error) { return fail(res, 422, error.code || 'VALIDATION_ERROR', error.message); }
  try { const battle = await createBattle(req.user.id, input); res.status(201).json({ success: true, data: serializeBattle(battle, { organizer: true }) }); }
  catch (error) { if (error.code === 'CODEBASE_NOT_FOUND' || error.code === 'VERSION_NOT_FOUND') return fail(res, 404, error.code, error.message); throw error; }
}

export async function listOwned(req, res) {
  const battles = await Battle.find({ ownerId: req.user.id }).select('+eligibleUserIds').sort({ startsAt: -1 }).lean(), rows = [];
  for (const item of battles) rows.push(serializeBattle(await refreshBattle(item), { organizer: true, state: getBattleState(item) }));
  res.json({ success: true, data: rows });
}

export async function detail(req, res) {
  const owner = req.path.startsWith('/manage/');
  const battle = await Battle.findOne({ _id: req.params.id, codebaseVersionId: { $exists: true }, ...(owner ? { ownerId: req.user.id } : {}) }).select('+eligibleUserIds');
  if (!battle || (!owner && (battle.status === 'DRAFT' || battle.status === 'CANCELLED' || !isEligible(battle, req.user.id)))) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  const current = await refreshBattle(battle), state = getBattleState(current);
  const challenge = await loadChallengeVersion(current);
  if (!challenge) return fail(res, 404, 'CHALLENGE_UNAVAILABLE', 'The published challenge version is unavailable.');
  const registration = await Registration.findOne({ battleId: battle._id, userId: req.user.id }).select('_id status createdAt');
  res.json({ success: true, data: { ...serializeBattle(current, { organizer: owner, state }), challenge: publicChallenge(challenge.snapshot), registration: registration ? serializeRegistration(registration) : null } });
}

export async function update(req, res) {
  let input; try { input = validateBattleInput(req.body || {}, { partial: true }); } catch (error) { return fail(res, 422, error.code || 'VALIDATION_ERROR', error.message); }
  const battle = await Battle.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  if (!['DRAFT', 'SCHEDULED', 'REGISTRATION_CLOSED'].includes(battle.status) || new Date() >= battle.startsAt) return fail(res, 409, 'BATTLE_LOCKED', 'Battle configuration is locked after the battle starts.');
  const merged = { ...battle.toObject(), ...input };
  if (new Date(merged.registrationDeadline) >= new Date(merged.startsAt)) return fail(res, 422, 'INVALID_SCHEDULE', 'Registration deadline must precede the battle start.');
  if (input.capacity !== undefined && input.capacity < battle.registrationCount) return fail(res, 422, 'CAPACITY_BELOW_REGISTRATIONS', 'Capacity cannot be lower than current registrations.');
  try { await updateBattle(battle, input); res.json({ success: true, data: serializeBattle(battle, { organizer: true }) }); }
  catch (error) { if (error.code === 'VERSION_NOT_FOUND') return fail(res, 404, error.code, error.message); throw error; }
}

export async function publish(req, res) {
  const battle = await Battle.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  try { const saved = await publishBattle(battle); res.json({ success: true, data: serializeBattle(saved, { organizer: true }) }); }
  catch (error) { if (['INVALID_BATTLE_STATE', 'INVALID_BATTLE_SCHEDULE', 'VERSION_NOT_FOUND'].includes(error.code)) return fail(res, 409, error.code, error.message); throw error; }
}

export async function cancel(req, res) {
  const battle = await Battle.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  if (new Date() >= battle.startsAt || ['LIVE', 'COMPLETED', 'CANCELLED'].includes(getBattleState(battle))) return fail(res, 409, 'BATTLE_LOCKED', 'A started or completed battle cannot be cancelled.');
  battle.status = 'CANCELLED'; await battle.save();
  res.json({ success: true, data: serializeBattle(battle, { organizer: true }) });
}

export async function publishResults(req, res) {
  const battle = await Battle.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  if (getBattleState(battle) !== 'COMPLETED') return fail(res, 409, 'BATTLE_NOT_COMPLETE', 'Results can only be published after the battle ends.');
  battle.resultsPublished = true; await battle.save();
  res.json({ success: true, data: { battleId: String(battle._id), status: 'COMPLETED', evaluation: 'DISABLED', rankings: null, note: 'Submissions are not evaluated; no rankings are available.' } });
}

export async function participants(req, res) {
  const battle = await Battle.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  const rows = await Registration.find({ battleId: battle._id, status: 'REGISTERED' }).sort({ createdAt: 1 }).lean();
  const submitted = await BattleSubmission.find({ battleId: battle._id }).select('userId evaluationStatus createdAt').lean();
  const byUser = new Map(submitted.map(row => [row.userId, row]));
  res.json({ success: true, data: rows.map(row => ({ registrationId: String(row._id), candidateId: row.userId, registeredAt: row.createdAt, submission: byUser.has(row.userId) ? { evaluationStatus: byUser.get(row.userId).evaluationStatus, submittedAt: byUser.get(row.userId).createdAt } : null })) });
}

export async function register(req, res) {
  const battle = await Battle.findOne({ _id: req.params.id, status: { $nin: ['DRAFT', 'CANCELLED'] }, codebaseVersionId: { $exists: true } }).select('+eligibleUserIds');
  if (!battle || !isEligible(battle, req.user.id)) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  try { const registration = await registerCandidate(battle, req.user.id); res.status(201).json({ success: true, data: serializeRegistration(registration) }); }
  catch (error) { const codes = ['REGISTRATION_CLOSED', 'BATTLE_FULL_OR_CLOSED', 'ALREADY_REGISTERED', 'NOT_ELIGIBLE']; if (codes.includes(error.code)) return fail(res, 409, error.code, error.message); throw error; }
}

export async function unregister(req, res) {
  const battle = await Battle.findById(req.params.id).select('+eligibleUserIds');
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  try { const registration = await cancelRegistration(battle, req.user.id); if (!registration) return fail(res, 404, 'REGISTRATION_NOT_FOUND', 'Active registration was not found.'); res.json({ success: true, data: serializeRegistration(registration) }); }
  catch (error) { if (error.code === 'CANCELLATION_CLOSED') return fail(res, 409, error.code, error.message); throw error; }
}

export async function lobby(req, res) {
  const battle = await Battle.findOne({ _id: req.params.id, status: { $nin: ['DRAFT', 'CANCELLED'] }, codebaseVersionId: { $exists: true } }).select('+eligibleUserIds');
  if (!battle || !isEligible(battle, req.user.id)) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  const registration = await Registration.findOne({ battleId: battle._id, userId: req.user.id, status: 'REGISTERED' });
  if (!registration) return fail(res, 403, 'REGISTRATION_REQUIRED', 'Register for this battle to enter the lobby.');
  return detail(req, res);
}

export async function workspace(req, res) {
  const battle = await Battle.findById(req.params.id);
  if (!battle || ['DRAFT', 'CANCELLED'].includes(battle.status)) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  try {
    const result = await getCandidateWorkspace(battle, req.user.id, new Date(), req.method === 'POST');
    if (!result.workspace) return res.json({ success: true, data: null });
    const challenge = await loadChallengeVersion(battle, true);
    if (!challenge) return fail(res, 404, 'CHALLENGE_UNAVAILABLE', 'The challenge version is unavailable.');
    res.json({ success: true, data: { ...serializeWorkspace(result.workspace, result.files), challenge: publicChallenge(challenge.snapshot, true) } });
  } catch (error) { if (error.code === 'REGISTRATION_REQUIRED') return fail(res, 403, error.code, error.message); if (['BATTLE_NOT_LIVE', 'VERSION_NOT_FOUND'].includes(error.code)) return fail(res, 409, error.code, error.message); throw error; }
}

export async function saveWorkspace(req, res) {
  const battle = await Battle.findById(req.params.id), registration = battle && await Registration.findOne({ battleId: battle._id, userId: req.user.id, status: 'REGISTERED' });
  if (!battle || !registration) return fail(res, 404, 'NOT_FOUND', 'Battle workspace was not found.');
  const result = await BattleWorkspace.findOne({ _id: req.params.workspaceId, battleId: battle._id, registrationId: registration._id, userId: req.user.id }).select('+files.storageKey');
  if (!result) return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Battle workspace was not found.');
  const state = await refreshBattle(battle);
  if (getBattleState(state) !== 'LIVE') return fail(res, 409, 'SUBMISSION_CLOSED', 'The battle workspace is closed.');
  const challenge = await loadChallengeVersion(battle, true);
  if (!challenge) return fail(res, 404, 'CHALLENGE_UNAVAILABLE', 'The challenge version is unavailable.');
  try { const saved = await saveBattleWorkspace(result, challenge.snapshot.files, req.body || {}); res.json({ success: true, data: serializeWorkspace(saved, []) }); }
  catch (error) { if (error.code === 'WORKSPACE_TOO_LARGE') return fail(res, 413, error.code, error.message); if (error.code === 'WORKSPACE_CONFLICT') return fail(res, 409, error.code, error.message); if (error instanceof Error && error.code === undefined) return fail(res, 422, 'INVALID_WORKSPACE', error.message); throw error; }
}

export async function submit(req, res) {
  const battle = await Battle.findById(req.params.id), registration = battle && await Registration.findOne({ battleId: battle._id, userId: req.user.id, status: 'REGISTERED' });
  if (!battle || !registration) return fail(res, 404, 'NOT_FOUND', 'Battle submission was not found.');
  const workspace = await BattleWorkspace.findOne({ _id: req.body?.workspaceId, battleId: battle._id, registrationId: registration._id, userId: req.user.id }).select('+files.storageKey');
  if (!workspace) return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Battle workspace was not found.');
  const challenge = await loadChallengeVersion(battle, true);
  if (!challenge) return fail(res, 404, 'CHALLENGE_UNAVAILABLE', 'The challenge version is unavailable.');
  try { const created = await submitBattleWorkspace(battle, workspace, challenge.snapshot.files); res.status(201).json({ success: true, data: serializeSubmission(created) }); }
  catch (error) {
    if (error.code === 11000) return fail(res, 409, 'ALREADY_SUBMITTED', 'This battle workspace already has a final submission.');
    if (['WORKSPACE_CONFLICT', 'SUBMISSION_CLOSED', 'ALREADY_SUBMITTED'].includes(error.code)) return fail(res, 409, error.code, error.message);
    throw error;
  }
}

export async function ownHistory(req, res) {
  const rows = await getOwnBattleHistory(req.user.id);
  res.json({ success: true, data: rows.map(({ registration, battle, submission }) => ({ battle: serializeBattle(battle, { state: getBattleState(battle) }), registration: serializeRegistration(registration), submission: submission ? serializeSubmission(submission) : null })) });
}

export async function ownSubmission(req, res) {
  const submission = await BattleSubmission.findOne({ _id: req.params.submissionId, userId: req.user.id }).select('+files +files.storageKey');
  if (!submission) return fail(res, 404, 'NOT_FOUND', 'Submission was not found.');
  const files = await Promise.all((submission.files || []).map(async file => ({ path: file.path, size: file.size, content: (await localFileStorage.get(file.storageKey)).toString('utf8') })));
  return res.json({ success: true, data: { ...serializeSubmission(submission), files } });
}

export async function results(req, res) {
  const battle = await Battle.findById(req.params.id).select('+eligibleUserIds');
  if (!battle || ['DRAFT', 'CANCELLED'].includes(battle.status) || !isEligible(battle, req.user.id)) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  const state = getBattleState(battle);
  if (state !== 'COMPLETED') return fail(res, 409, 'RESULTS_PENDING', 'Results are not available until the battle ends.');
  const own = await BattleSubmission.findOne({ battleId: battle._id, userId: req.user.id }).select('-files -result');
  const submissions = battle.resultsPublished ? await BattleSubmission.countDocuments({ battleId: battle._id }) : undefined;
  res.json({ success: true, data: { battleId: String(battle._id), status: 'COMPLETED', evaluation: 'DISABLED', rankings: null, submitted: Boolean(own), submission: own ? serializeSubmission(own) : null, ...(battle.resultsPublished ? { submissions } : {}) } });
}

export async function organizerSubmissions(req, res) {
  const battle = await Battle.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  if (getBattleState(battle) !== 'COMPLETED') return fail(res, 409, 'BATTLE_NOT_COMPLETE', 'Submissions are available after the battle ends.');
  const rows = await BattleSubmission.find({ battleId: battle._id }).sort({ createdAt: 1 }).select('-files -result').lean();
  res.json({ success: true, data: rows.map(row => ({ ...serializeSubmission(row), candidateId: row.userId })) });
}

export async function organizerSubmission(req, res) {
  const battle = await Battle.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  if (getBattleState(battle) !== 'COMPLETED') return fail(res, 409, 'BATTLE_NOT_COMPLETE', 'Submissions are available after the battle ends.');
  const submission = await BattleSubmission.findOne({ _id: req.params.submissionId, battleId: battle._id }).select('+files +files.storageKey');
  if (!submission) return fail(res, 404, 'NOT_FOUND', 'Submission was not found.');
  const files = await Promise.all((submission.files || []).map(async file => ({ path: file.path, size: file.size, content: (await localFileStorage.get(file.storageKey)).toString('utf8') })));
  res.json({ success: true, data: { ...serializeSubmission(submission), candidateId: submission.userId, files } });
}
