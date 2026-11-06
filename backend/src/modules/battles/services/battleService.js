import Battle from '../../../models/Battle.js';
import BattleSubmission from '../../../models/BattleSubmission.js';
import BattleWorkspace from '../../../models/BattleWorkspace.js';
import Codebase from '../../../models/Codebase.js';
import CodebaseVersion from '../../../models/CodebaseVersion.js';
import Registration from '../../../models/Registration.js';
import { localFileStorage } from '../../post-codebase/services/localFileStorage.js';
import { readProjectFiles } from '../../post-codebase/services/projectFiles.js';
import { MAX_TOTAL_BYTES } from '../../post-codebase/services/filePolicy.js';
import { validateWorkspaceFiles } from '../../view-codebases/validators/candidateInput.js';
import { endsAt, getBattleState, refreshBattle } from './lifecycle.js';
import { evaluationProvider } from './evaluationProvider.js';

export async function loadChallengeVersion(battle, includeText = false) {
  const version = await CodebaseVersion.findOne({ _id: battle.codebaseVersionId, codebaseId: battle.codebaseId, version: battle.codebaseVersion }).select('+snapshot');
  if (!version?.snapshot) return null;
  const snapshot = version.snapshot.toObject ? version.snapshot.toObject() : version.snapshot;
  const files = (snapshot.files || []).map(({ path, size, contentType, storageKey, content }) => ({ path, size, contentType, storageKey, content }));
  if (includeText) {
    const source = await readProjectFiles(files);
    snapshot.files = source.map(file => ({ ...file, size: Buffer.byteLength(file.content, 'utf8') }));
  } else snapshot.files = files.map(({ path, size, contentType }) => ({ path, size, contentType }));
  return { version, snapshot };
}

export function isEligible(battle, userId) { return !battle.eligibleUserIds?.length || battle.eligibleUserIds.includes(String(userId)); }

export async function createBattle(ownerId, input) {
  const codebase = await Codebase.findOne({ _id: input.codebaseId, ownerId });
  if (!codebase) throw Object.assign(new Error('Choose a codebase you own.'), { code: 'CODEBASE_NOT_FOUND' });
  const version = await CodebaseVersion.findOne({ codebaseId: codebase._id, version: input.codebaseVersion }).select('_id version +snapshot');
  if (!version) throw Object.assign(new Error('Choose an existing published codebase version.'), { code: 'VERSION_NOT_FOUND' });
  return Battle.create({ ...input, ownerId, codebaseId: codebase._id, codebaseVersionId: version._id, challengeTitle: version.snapshot.title, difficulty: version.snapshot.difficulty, languages: version.snapshot.languages || [], status: 'DRAFT' });
}

export async function updateBattle(battle, input) {
  const priorState = battle.status;
  Object.assign(battle, input);
  if (input.codebaseId !== undefined || input.codebaseVersion !== undefined) {
    const codebaseId = input.codebaseId || String(battle.codebaseId);
    const versionNumber = input.codebaseVersion || battle.codebaseVersion;
    const codebase = await Codebase.findOne({ _id: codebaseId, ownerId: battle.ownerId });
    const version = codebase && await CodebaseVersion.findOne({ codebaseId, version: versionNumber }).select('_id version +snapshot');
    if (!version) throw Object.assign(new Error('Choose an existing version of a codebase you own.'), { code: 'VERSION_NOT_FOUND' });
    battle.codebaseId = codebaseId; battle.codebaseVersionId = version._id; battle.codebaseVersion = version.version; battle.challengeTitle = version.snapshot.title; battle.difficulty = version.snapshot.difficulty; battle.languages = version.snapshot.languages || [];
  }
  if (['SCHEDULED', 'REGISTRATION_CLOSED'].includes(priorState) && new Date() < new Date(battle.startsAt)) battle.status = new Date() >= new Date(battle.registrationDeadline) ? 'REGISTRATION_CLOSED' : 'SCHEDULED';
  return battle.save();
}

export async function publishBattle(battle, now = new Date()) {
  if (battle.status !== 'DRAFT') throw Object.assign(new Error('Only draft battles can be published.'), { code: 'INVALID_BATTLE_STATE' });
  if (new Date(battle.startsAt) <= now || new Date(battle.registrationDeadline) >= new Date(battle.startsAt)) throw Object.assign(new Error('Set a future start time and a registration deadline before it.'), { code: 'INVALID_BATTLE_SCHEDULE' });
  if (!await loadChallengeVersion(battle)) throw Object.assign(new Error('The selected published challenge version is unavailable.'), { code: 'VERSION_NOT_FOUND' });
  battle.status = 'SCHEDULED';
  await battle.save();
  return battle;
}

export async function registerCandidate(battle, userId, now = new Date()) {
  const state = getBattleState(battle, now);
  if (!isEligible(battle, userId)) throw Object.assign(new Error('You are not eligible for this battle.'), { code: 'NOT_ELIGIBLE' });
  if (battle.status === 'CANCELLED' || state === 'CANCELLED' || state !== 'SCHEDULED' || now >= new Date(battle.registrationDeadline)) throw Object.assign(new Error('Registration is closed.'), { code: 'REGISTRATION_CLOSED' });
  const prior = await Registration.findOne({ battleId: battle._id, userId: String(userId) });
  if (prior?.status === 'REGISTERED') throw Object.assign(new Error('You are already registered for this battle.'), { code: 'ALREADY_REGISTERED' });
  const slot = await Battle.findOneAndUpdate({ _id: battle._id, status: 'SCHEDULED', startsAt: { $gt: now }, registrationDeadline: { $gt: now }, $expr: { $lt: ['$registrationCount', '$capacity'] }, $or: [{ eligibleUserIds: { $exists: false } }, { eligibleUserIds: { $size: 0 } }, { eligibleUserIds: String(userId) }] }, { $inc: { registrationCount: 1 } }, { new: true });
  if (!slot) throw Object.assign(new Error('Battle is full or registration has closed.'), { code: 'BATTLE_FULL_OR_CLOSED' });
  try {
    if (prior) {
      const reactivated = await Registration.findOneAndUpdate({ _id: prior._id, battleId: battle._id, userId: String(userId), status: 'CANCELLED' }, { $set: { status: 'REGISTERED' } }, { new: true });
      if (!reactivated) throw Object.assign(new Error('You are already registered for this battle.'), { code: 11000 });
      return reactivated;
    }
    return await Registration.create({ battleId: battle._id, userId: String(userId) });
  }
  catch (error) {
    await Battle.updateOne({ _id: battle._id, registrationCount: { $gt: 0 } }, { $inc: { registrationCount: -1 } });
    if (error.code === 11000) throw Object.assign(new Error('You are already registered for this battle.'), { code: 'ALREADY_REGISTERED' });
    throw error;
  }
}

export async function cancelRegistration(battle, userId, now = new Date()) {
  if (now >= new Date(battle.registrationDeadline) || now >= new Date(battle.startsAt) || ['CANCELLED', 'COMPLETED'].includes(getBattleState(battle, now))) throw Object.assign(new Error('Registration can no longer be cancelled.'), { code: 'CANCELLATION_CLOSED' });
  const registration = await Registration.findOneAndUpdate({ battleId: battle._id, userId: String(userId), status: 'REGISTERED' }, { $set: { status: 'CANCELLED' } }, { new: true });
  if (!registration) return null;
  await Battle.updateOne({ _id: battle._id, registrationCount: { $gt: 0 } }, { $inc: { registrationCount: -1 } });
  return registration;
}

export async function getCandidateWorkspace(battle, userId, now = new Date(), create = false) {
  const registration = await Registration.findOne({ battleId: battle._id, userId: String(userId), status: 'REGISTERED' });
  if (!registration) throw Object.assign(new Error('An active registration is required.'), { code: 'REGISTRATION_REQUIRED' });
  const state = getBattleState(battle, now);
  if (state !== 'LIVE' && !(state === 'COMPLETED' && !create)) throw Object.assign(new Error(state === 'SCHEDULED' ? 'The battle has not started.' : 'The battle workspace is closed.'), { code: 'BATTLE_NOT_LIVE' });
  let workspace = await BattleWorkspace.findOne({ battleId: battle._id, registrationId: registration._id, userId: String(userId) }).select('+files.storageKey');
  if (!workspace && create) {
    const loaded = await loadChallengeVersion(battle, true);
    if (!loaded) throw Object.assign(new Error('The challenge version is unavailable.'), { code: 'VERSION_NOT_FOUND' });
    try { workspace = await BattleWorkspace.create({ battleId: battle._id, registrationId: registration._id, codebaseVersionId: battle.codebaseVersionId, userId: String(userId), files: [], revision: 0 }); }
    catch (error) { if (error.code !== 11000) throw error; workspace = await BattleWorkspace.findOne({ battleId: battle._id, registrationId: registration._id, userId: String(userId) }).select('+files.storageKey'); }
  }
  if (!workspace) return { registration, workspace: null, files: [] };
  const loaded = await loadChallengeVersion(battle, true);
  if (!loaded) throw Object.assign(new Error('The challenge version is unavailable.'), { code: 'VERSION_NOT_FOUND' });
  const originals = loaded.snapshot.files || [];
  const overrides = await Promise.all((workspace.files || []).map(async file => ({ path: file.path, size: file.size, content: (await localFileStorage.get(file.storageKey)).toString('utf8') })));
  const changed = new Map(overrides.map(file => [file.path, file]));
  return { registration, workspace, files: originals.map(file => changed.get(file.path) || file) };
}

export async function saveBattleWorkspace(workspace, codebaseFiles, input) {
  if (workspace.status !== 'ACTIVE') throw Object.assign(new Error('This battle workspace is no longer editable.'), { code: 'WORKSPACE_CLOSED' });
  if (Number(input.revision) !== workspace.revision || !Number.isInteger(Number(input.revision))) throw Object.assign(new Error('Workspace changed in another session. Reload the latest version.'), { code: 'WORKSPACE_CONFLICT' });
  const changes = validateWorkspaceFiles(input.files, codebaseFiles.map(file => file.path));
  const resetPaths = Array.isArray(input.resetPaths) ? input.resetPaths : [];
  const allowed = new Set(codebaseFiles.map(file => file.path));
  if (resetPaths.length > 300 || resetPaths.some(path => typeof path !== 'string' || !allowed.has(path)) || new Set(resetPaths).size !== resetPaths.length) throw new Error('Reset paths must be unique source files in this challenge.');
  const old = new Map((workspace.files || []).map(file => [file.path, file]));
  const refs = [], created = [];
  try {
    for (const path of resetPaths) old.delete(path);
    for (const file of changes) {
      const key = await localFileStorage.put(Buffer.from(file.content, 'utf8')); created.push(key); refs.push({ path: file.path, size: file.size, storageKey: key });
      old.delete(file.path);
    }
    refs.push(...old.values());
    const sizes = new Map(codebaseFiles.map(file => [file.path, file.size || 0])); for (const file of refs) sizes.set(file.path, file.size);
    if (sizes.size > 300 || [...sizes.values()].reduce((sum, n) => sum + n, 0) > MAX_TOTAL_BYTES) throw Object.assign(new Error('Workspace exceeds the file or project size limit.'), { code: 'WORKSPACE_TOO_LARGE' });
    const saved = await BattleWorkspace.findOneAndUpdate({ _id: workspace._id, userId: workspace.userId, registrationId: workspace.registrationId, status: 'ACTIVE', revision: workspace.revision }, { $set: { files: refs }, $inc: { revision: 1 } }, { new: true, runValidators: true }).select('+files.storageKey');
    if (!saved) throw Object.assign(new Error('Workspace changed in another session. Reload the latest version.'), { code: 'WORKSPACE_CONFLICT' });
    const active = new Set(refs.map(file => file.storageKey)); await Promise.all((workspace.files || []).filter(file => !active.has(file.storageKey)).map(file => localFileStorage.remove(file.storageKey)));
    return saved;
  } catch (error) { await Promise.all(created.map(key => localFileStorage.remove(key))); throw error; }
}

export async function submitBattleWorkspace(battle, workspace, codebaseFiles, now = new Date()) {
  if (getBattleState(battle, now) !== 'LIVE' || now >= endsAt(battle)) throw Object.assign(new Error('The submission deadline has passed.'), { code: 'SUBMISSION_CLOSED' });
  if (workspace.status !== 'ACTIVE') throw Object.assign(new Error('This workspace has already been submitted.'), { code: 'ALREADY_SUBMITTED' });
  const loaded = await loadChallengeVersion(battle, true);
  const originals = loaded?.snapshot.files || [];
  const overrides = new Map((workspace.files || []).map(file => [file.path, file]));
  const snapshotFiles = [];
  try {
    for (const file of originals) {
      const current = overrides.get(file.path);
      const content = current ? (await localFileStorage.get(current.storageKey)).toString('utf8') : file.content;
      snapshotFiles.push({ path: file.path, size: Buffer.byteLength(content, 'utf8'), storageKey: await localFileStorage.put(Buffer.from(content, 'utf8')) });
    }
    const evaluation = await evaluationProvider.evaluate({ battleId: String(battle._id), workspaceId: String(workspace._id) });
    const submission = await BattleSubmission.create({ battleId: battle._id, workspaceId: workspace._id, registrationId: workspace.registrationId, codebaseVersionId: battle.codebaseVersionId, userId: workspace.userId, files: snapshotFiles, fileCount: snapshotFiles.length, evaluationStatus: evaluation.status, result: evaluation.result });
    const updated = await BattleWorkspace.findOneAndUpdate({ _id: workspace._id, userId: workspace.userId, status: 'ACTIVE', revision: workspace.revision }, { $set: { status: 'SUBMITTED' }, $inc: { revision: 1 } }, { new: true });
    if (!updated) { await BattleSubmission.deleteOne({ _id: submission._id, userId: workspace.userId }); throw Object.assign(new Error('Workspace changed before submission. Reload and try again.'), { code: 'WORKSPACE_CONFLICT' }); }
    return submission;
  } catch (error) { await Promise.all(snapshotFiles.map(file => localFileStorage.remove(file.storageKey))); throw error; }
}

export async function getOwnBattleHistory(userId) {
  const registrations = await Registration.find({ userId: String(userId) }).sort({ createdAt: -1 }).lean();
  const ids = registrations.map(row => row.battleId);
  const battles = await Battle.find({ _id: { $in: ids } }).select('-eligibleUserIds -ownerId').lean();
  const byId = new Map(battles.map(row => [String(row._id), row]));
  const submissions = await BattleSubmission.find({ userId: String(userId) }).select('-files -result').lean();
  const submitted = new Map(submissions.map(row => [String(row.battleId), row]));
  return registrations.map(registration => ({ registration, battle: byId.get(String(registration.battleId)), submission: submitted.get(String(registration.battleId)) })).filter(item => item.battle);
}

export { endsAt, getBattleState, refreshBattle };
