import test from 'node:test';
import assert from 'node:assert/strict';
import Battle from '../../models/Battle.js';
import BattleRegistration from '../../models/Registration.js';
import BattleWorkspace from '../../models/BattleWorkspace.js';
import BattleSubmission from '../../models/BattleSubmission.js';
import CodebaseVersion from '../../models/CodebaseVersion.js';
import { validateBattleInput } from './validators/battleInput.js';
import { endsAt, getBattleState } from './services/lifecycle.js';
import { registerCandidate, saveBattleWorkspace, submitBattleWorkspace } from './services/battleService.js';
import { discoverBattles } from './controllers/battleController.js';
import { isEligible } from './services/battleService.js';
import { publicChallenge } from './serializers/battleSerializer.js';
import { localFileStorage } from '../post-codebase/services/localFileStorage.js';
import { evaluationProvider } from './services/evaluationProvider.js';

test('battle model has version binding, lifecycle validation, capacity and uniqueness indexes', () => {
  assert.equal(Battle.schema.path('codebaseVersionId').options.required, true);
  assert.deepEqual(Battle.schema.path('status').enumValues, ['DRAFT', 'SCHEDULED', 'REGISTRATION_CLOSED', 'LIVE', 'SUBMISSION_CLOSED', 'EVALUATING', 'COMPLETED', 'CANCELLED']);
  assert.equal(BattleRegistration.schema.indexes().some(([fields, options]) => fields.battleId === 1 && fields.userId === 1 && options.unique), true);
  assert.equal(BattleWorkspace.schema.indexes().some(([fields, options]) => fields.battleId === 1 && fields.userId === 1 && options.unique), true);
  assert.equal(BattleSubmission.schema.indexes().some(([fields, options]) => fields.workspaceId === 1 && options.unique), true);
  assert.equal(BattleSubmission.schema.path('files').options.select, false);
  assert.equal(BattleSubmission.schema.path('result').options.select, false);
});

test('battle input is allowlisted, validates schedule, and rejects mass assignment fields', () => {
  const input = validateBattleInput({ title: ' Debug sprint ', description: 'Repair cache', codebaseId: '507f1f77bcf86cd799439011', codebaseVersion: '3', startsAt: '2030-01-01T12:00:00Z', registrationDeadline: '2030-01-01T11:00:00Z', durationMinutes: '45', capacity: '20', ownerId: 'attacker', status: 'LIVE', registrationCount: 999 });
  assert.equal(input.title, 'Debug sprint');
  assert.equal(input.capacity, 20);
  assert.equal(Object.hasOwn(input, 'ownerId'), false);
  assert.equal(Object.hasOwn(input, 'status'), false);
  assert.throws(() => validateBattleInput({ title: 'Bad', description: '', instructions: '', rules: '', codebaseId: 'id', codebaseVersion: 1, startsAt: '2030-01-01T12:00:00Z', registrationDeadline: '2030-01-01T12:00:00Z', durationMinutes: 60, capacity: 20 }), /deadline/);
});

test('battle challenge preview is allowlisted and eligibility checks do not disclose private IDs', () => {
  const preview = publicChallenge({ title: 'Public challenge', bugDescription: 'Stale output', ownerId: 'creator', hiddenTests: [{ secret: true }], privateNotes: 'secret', files: [{ path: 'src/main.js', storageKey: 'private-key', content: 'source' }] });
  assert.equal(preview.title, 'Public challenge');
  assert.equal(preview.files[0].path, 'src/main.js');
  assert.equal(Object.hasOwn(preview, 'ownerId'), false);
  assert.equal(JSON.stringify(preview).includes('private-key'), false);
  assert.equal(JSON.stringify(preview).includes('secret'), false);
  assert.equal(isEligible({ eligibleUserIds: ['candidate-a'] }, 'candidate-a'), true);
  assert.equal(isEligible({ eligibleUserIds: ['candidate-a'] }, 'candidate-b'), false);
  assert.equal(isEligible({ eligibleUserIds: [] }, 'candidate-b'), true);
});

test('battle lifecycle and end time are derived from server timestamps', () => {
  const battle = { status: 'SCHEDULED', startsAt: new Date('2030-01-01T12:00:00Z'), registrationDeadline: new Date('2030-01-01T11:00:00Z'), durationMinutes: 60 };
  assert.equal(getBattleState(battle, new Date('2030-01-01T10:00:00Z')), 'SCHEDULED');
  assert.equal(getBattleState(battle, new Date('2030-01-01T11:30:00Z')), 'REGISTRATION_CLOSED');
  assert.equal(getBattleState(battle, new Date('2030-01-01T12:30:00Z')), 'LIVE');
  assert.equal(getBattleState(battle, new Date('2030-01-01T13:00:00Z')), 'COMPLETED');
  assert.equal(endsAt(battle).toISOString(), '2030-01-01T13:00:00.000Z');
});

test('battle discovery applies eligibility and filters before database pagination', async () => {
  const originalAggregate = Battle.aggregate;
  let pipeline;
  Battle.aggregate = async value => { pipeline = value; return [{ rows: [{ _id: 'battle', ownerId: 'organizer', eligibleUserIds: ['candidate-a'], title: 'Cache sprint', status: 'SCHEDULED', startsAt: new Date(Date.now() + 600_000), registrationDeadline: new Date(Date.now() + 300_000), durationMinutes: 30, capacity: 10, registrationCount: 2, codebaseVersionId: 'version', codebaseVersion: 2 }], count: [{ total: 1 }] }]; };
  const response = { status() { return this; }, json(body) { this.body = body; return this; } };
  try {
    await discoverBattles({ query: { q: 'Cache', status: 'upcoming', difficulty: 'Medium', language: 'JavaScript', page: '2', limit: '5' }, user: { id: 'candidate-a' } }, response);
    const match = pipeline[0].$match;
    assert.equal(match.$and.some(item => item.$or?.some(choice => choice.eligibleUserIds === 'candidate-a')), true);
    assert.equal(match.$and.some(item => item.difficulty === 'Medium' && item.languages === 'JavaScript'), true);
    assert.equal(match.$and.some(item => item.startsAt?.$gt instanceof Date), true);
    assert.equal(pipeline.at(-1).$facet.rows[0].$skip, 5);
    assert.equal(response.body.pagination.total, 1);
    assert.equal(Object.hasOwn(response.body.data[0], 'eligibleUserIds'), false);
  } finally { Battle.aggregate = originalAggregate; }
});

test('registration atomically reserves capacity and rolls back a duplicate reservation', async () => {
  const originalFindOneAndUpdate = Battle.findOneAndUpdate, originalUpdateOne = Battle.updateOne, originalFindOne = BattleRegistration.findOne, originalCreate = BattleRegistration.create;
  let occupied = 0, reservationFilter, rollsBack = 0;
  Battle.findOneAndUpdate = (filter, update) => {
    reservationFilter = filter;
    assert.equal(update.$inc.registrationCount, 1);
    if (occupied >= 2) return Promise.resolve(null);
    occupied += 1; return Promise.resolve({ _id: 'battle' });
  };
  Battle.updateOne = async () => { occupied -= 1; rollsBack += 1; };
  BattleRegistration.findOne = async () => null;
  BattleRegistration.create = async () => { const error = new Error('duplicate'); error.code = 11000; throw error; };
  const battle = { _id: 'battle', status: 'SCHEDULED', startsAt: new Date(Date.now() + 600_000), registrationDeadline: new Date(Date.now() + 300_000), eligibleUserIds: [] };
  try {
    await assert.rejects(registerCandidate(battle, 'candidate-a'), error => error.code === 'ALREADY_REGISTERED');
    assert.equal(occupied, 0);
    assert.equal(rollsBack, 1);
    assert.equal(reservationFilter.$expr.$lt[1], '$capacity');
    assert.equal(reservationFilter.registrationDeadline.$gt instanceof Date, true);
  } finally { Battle.findOneAndUpdate = originalFindOneAndUpdate; Battle.updateOne = originalUpdateOne; BattleRegistration.findOne = originalFindOne; BattleRegistration.create = originalCreate; }
});

test('simultaneous registrations cannot exceed the capacity predicate', async () => {
  const originalFindOneAndUpdate = Battle.findOneAndUpdate, originalRegistrationFind = BattleRegistration.findOne, originalCreate = BattleRegistration.create;
  let occupied = 0;
  BattleRegistration.findOne = async () => null;
  BattleRegistration.create = async ({ battleId, userId }) => ({ _id: `registration-${userId}`, battleId, userId, status: 'REGISTERED' });
  Battle.findOneAndUpdate = filter => {
    assert.equal(filter.$expr.$lt[1], '$capacity');
    if (occupied >= 2) return Promise.resolve(null);
    occupied += 1;
    return Promise.resolve({ _id: 'battle' });
  };
  const battle = { _id: 'battle', status: 'SCHEDULED', startsAt: new Date(Date.now() + 600_000), registrationDeadline: new Date(Date.now() + 300_000), eligibleUserIds: [] };
  try {
    const outcomes = await Promise.allSettled(['a', 'b', 'c'].map(candidate => registerCandidate(battle, `candidate-${candidate}`)));
    assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 2);
    assert.equal(outcomes.filter(item => item.status === 'rejected' && item.reason.code === 'BATTLE_FULL_OR_CLOSED').length, 1);
    assert.equal(occupied, 2);
  } finally { Battle.findOneAndUpdate = originalFindOneAndUpdate; BattleRegistration.findOne = originalRegistrationFind; BattleRegistration.create = originalCreate; }
});

test('registration and final submission reject expired server-time cutoffs', async () => {
  const closed = { _id: 'battle', status: 'SCHEDULED', startsAt: new Date(Date.now() + 600_000), registrationDeadline: new Date(Date.now() - 1000), durationMinutes: 30, eligibleUserIds: [] };
  await assert.rejects(registerCandidate(closed, 'candidate-a'), error => error.code === 'REGISTRATION_CLOSED');
  const ended = { ...closed, status: 'LIVE', startsAt: new Date(Date.now() - 3_600_000), durationMinutes: 30 };
  await assert.rejects(submitBattleWorkspace(ended, {}, []), error => error.code === 'SUBMISSION_CLOSED');
});

test('stale battle workspace writes remove temporary source objects and reject the revision', async () => {
  const originalUpdate = BattleWorkspace.findOneAndUpdate;
  let key;
  BattleWorkspace.findOneAndUpdate = (filter, update) => { key = update.$set.files[0].storageKey; assert.equal(filter.userId, 'candidate-a'); assert.equal(filter.registrationId, 'registration'); return { select: async () => null }; };
  const workspace = { _id: 'workspace', userId: 'candidate-a', registrationId: 'registration', revision: 4, status: 'ACTIVE', files: [] };
  try {
    await assert.rejects(saveBattleWorkspace(workspace, [{ path: 'src/main.js', size: 1, content: 'x' }], { revision: 4, files: [{ path: 'src/main.js', content: 'x' }] }), error => error.code === 'WORKSPACE_CONFLICT');
    await assert.rejects(localFileStorage.get(key));
  } finally { BattleWorkspace.findOneAndUpdate = originalUpdate; if (key) await localFileStorage.remove(key); }
});

test('battle submissions use immutable file objects and evaluation stays disabled', async () => {
  const originalVersionFind = CodebaseVersion.findOne, originalCreate = BattleSubmission.create, originalWorkspaceUpdate = BattleWorkspace.findOneAndUpdate;
  const publishedKey = await localFileStorage.put(Buffer.from('published source'));
  const editKey = await localFileStorage.put(Buffer.from('candidate solution'));
  let submissionDocument;
  const version = { snapshot: { files: [{ path: 'src/main.js', size: 16, contentType: 'text/plain', storageKey: publishedKey }] } };
  CodebaseVersion.findOne = () => ({ select: async () => version });
  BattleSubmission.create = async input => { submissionDocument = input; return { _id: 'submission', ...input, createdAt: new Date() }; };
  BattleWorkspace.findOneAndUpdate = async filter => { assert.equal(filter.userId, 'candidate-a'); return { status: 'SUBMITTED' }; };
  const battle = { _id: 'battle', codebaseId: 'codebase', codebaseVersionId: 'version', codebaseVersion: 1, status: 'LIVE', startsAt: new Date(Date.now() - 60_000), durationMinutes: 30 };
  const workspace = { _id: 'workspace', registrationId: 'registration', userId: 'candidate-a', revision: 2, status: 'ACTIVE', files: [{ path: 'src/main.js', size: 19, storageKey: editKey }] };
  try {
    const submission = await submitBattleWorkspace(battle, workspace, []);
    assert.equal(submissionDocument.evaluationStatus, 'NOT_EVALUATED');
    assert.deepEqual(await localFileStorage.get(submissionDocument.files[0].storageKey).then(value => value.toString()), 'candidate solution');
    assert.notEqual(submissionDocument.files[0].storageKey, editKey);
    await localFileStorage.remove(editKey);
    assert.equal((await localFileStorage.get(submissionDocument.files[0].storageKey)).toString(), 'candidate solution');
    assert.equal(evaluationProvider.available, false);
    assert.deepEqual(await evaluationProvider.evaluate({}), { status: 'NOT_EVALUATED', result: null });
    await localFileStorage.remove(submissionDocument.files[0].storageKey);
  } finally {
    CodebaseVersion.findOne = originalVersionFind; BattleSubmission.create = originalCreate; BattleWorkspace.findOneAndUpdate = originalWorkspaceUpdate;
    await localFileStorage.remove(publishedKey); await localFileStorage.remove(editKey); if (submissionDocument?.files?.[0]?.storageKey) await localFileStorage.remove(submissionDocument.files[0].storageKey);
  }
});
