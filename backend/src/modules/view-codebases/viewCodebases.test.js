import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeCandidateSummary } from './serializers/candidateSerializer.js';
import { validateWorkspaceFiles } from './validators/candidateInput.js';
import Attempt from '../../models/Attempt.js';
import Submission from '../../models/Submission.js';
import { localFileStorage } from '../post-codebase/services/localFileStorage.js';
import { createSubmission, readSubmission, saveWorkspace } from './services/candidateWorkspaceService.js';
import { evaluationProvider } from './services/evaluationProvider.js';

test('candidate summary serializer removes confidential and internal fields', () => {
  const result = serializeCandidateSummary({ _id: 'challenge', ownerId: 'creator', seriesId: 'series', sourceMetadata: { provider: 'zip' }, privateNotes: 'secret', hiddenTests: [{ answer: 42 }], files: [{ storageKey: 'private-key' }], title: 'Public' }, { progress: 'IN_PROGRESS', bookmarked: true });
  assert.equal(result.title, 'Public');
  assert.equal(result.progress, 'IN_PROGRESS');
  assert.equal(result.bookmarked, true);
  for (const key of ['ownerId', 'seriesId', 'sourceMetadata', 'privateNotes', 'hiddenTests', 'files']) assert.equal(Object.hasOwn(result, key), false);
});

test('evaluation provider explicitly reports unavailable evaluation without returning fabricated feedback', async () => {
  assert.equal(evaluationProvider.available, false);
  assert.deepEqual(await evaluationProvider.evaluate({}), { status: 'NOT_EVALUATED', feedback: null });
});

test('candidate workspace accepts only safe files from the published source tree', () => {
  const paths = ['src/main.js', 'README.md'];
  assert.deepEqual(validateWorkspaceFiles([{ path: 'src/main.js', content: 'const ok = true;' }], paths), [{ path: 'src/main.js', content: 'const ok = true;', size: 16 }]);
  assert.throws(() => validateWorkspaceFiles([{ path: '../outside.js', content: 'x' }], paths), /Unsafe path/);
  assert.throws(() => validateWorkspaceFiles([{ path: 'secret.js', content: 'x' }], paths), /only edit files/);
  assert.deepEqual(validateWorkspaceFiles([], paths), []);
});

test('candidate workspace and snapshot models keep file text out of MongoDB and enforce isolation indexes', () => {
  assert.equal(Attempt.schema.path('workspaceFiles.storageKey').options.select, false);
  assert.equal(Attempt.schema.path('workspaceFiles.content'), undefined);
  assert.equal(Attempt.schema.path('revision').options.default, 0);
  assert.equal(Submission.schema.path('submittedFiles').options.select, false);
  assert.equal(Submission.schema.path('result').options.select, false);
  assert.equal(Attempt.schema.indexes().some(([fields, options]) => fields.codebaseId === 1 && fields.publishedVersion === 1 && fields.userId === 1 && options.unique && options.partialFilterExpression?.status === 'IN_PROGRESS'), true);
  assert.equal(Submission.schema.indexes().some(([fields, options]) => fields.attemptId === 1 && options.unique), true);
});

test('workspace saves use owner and revision predicates and reject stale writes', async () => {
  const originalUpdate = Attempt.findOneAndUpdate;
  const firstKey = await localFileStorage.put(Buffer.from('old'));
  const attempt = { _id: 'attempt', userId: 'candidate-a', revision: 3, status: 'IN_PROGRESS', workspaceFiles: [{ path: 'src/main.js', size: 3, storageKey: firstKey }] };
  let predicate;
  Attempt.findOneAndUpdate = (filter, update) => {
    predicate = filter;
    const result = { ...attempt, revision: 4, workspaceFiles: update.$set.workspaceFiles };
    return { select: async () => result };
  };
  try {
    const saved = await saveWorkspace(attempt, [{ path: 'src/main.js', content: 'const saved = true;', size: 19 }], 3);
    assert.equal(predicate.userId, 'candidate-a');
    assert.equal(predicate.revision, 3);
    assert.equal(saved.revision, 4);
    assert.equal((await localFileStorage.get(saved.workspaceFiles[0].storageKey)).toString(), 'const saved = true;');
    await assert.rejects(saveWorkspace(saved, [], 3), error => error.code === 'WORKSPACE_CONFLICT');
    await localFileStorage.remove(saved.workspaceFiles[0].storageKey);
  } finally { Attempt.findOneAndUpdate = originalUpdate; await localFileStorage.remove(firstKey); }
});

test('a concurrent stale workspace update removes its unreferenced file and reports a conflict', async () => {
  const originalUpdate = Attempt.findOneAndUpdate;
  const attempt = { _id: 'attempt-race', userId: 'candidate-a', revision: 3, status: 'IN_PROGRESS', workspaceFiles: [] };
  let attemptedKey;
  Attempt.findOneAndUpdate = (filter, update) => {
    assert.equal(filter.userId, 'candidate-a');
    assert.equal(filter.revision, 3);
    attemptedKey = update.$set.workspaceFiles[0].storageKey;
    return { select: async () => null }; // another writer won the revision-3 conditional update
  };
  try {
    await assert.rejects(saveWorkspace(attempt, [{ path: 'src/main.js', content: 'winner', size: 6 }], 3), error => error.code === 'WORKSPACE_CONFLICT');
    await assert.rejects(localFileStorage.get(attemptedKey));
  } finally { Attempt.findOneAndUpdate = originalUpdate; if (attemptedKey) await localFileStorage.remove(attemptedKey); }
});

test('submission snapshots are stored separately from mutable workspace references', async () => {
  const originalUpdate = Attempt.findOneAndUpdate, originalCreate = Submission.create;
  const sourceKey = await localFileStorage.put(Buffer.from('original source'));
  const changedKey = await localFileStorage.put(Buffer.from('candidate solution'));
  const codebase = { _id: 'codebase', version: 2, files: [{ path: 'src/main.js', size: 15, storageKey: sourceKey }] };
  const attempt = { _id: 'attempt', codebaseId: 'codebase', publishedVersion: 2, userId: 'candidate-a', status: 'IN_PROGRESS', revision: 5, workspaceFiles: [{ path: 'src/main.js', size: 19, storageKey: changedKey }] };
  let created;
  Submission.create = async document => { created = document; return { _id: 'submission', ...document, createdAt: new Date('2026-01-01T00:00:00Z') }; };
  Attempt.findOneAndUpdate = async filter => { assert.equal(filter.userId, 'candidate-a'); assert.equal(filter.revision, 5); return { ...attempt, status: 'SUBMITTED', revision: 6 }; };
  try {
    const submission = await createSubmission(codebase, attempt, 5);
    assert.equal(created.evaluationStatus, 'NOT_EVALUATED');
    assert.equal(created.fileCount, 1);
    assert.deepEqual(await readSubmission(submission), [{ path: 'src/main.js', size: 18, content: 'candidate solution' }]);
    assert.notEqual(submission.submittedFiles[0].storageKey, changedKey);
    await assert.rejects(saveWorkspace({ ...attempt, status: 'SUBMITTED' }, [{ path: 'src/main.js', content: 'later workspace edit', size: 20 }], 5), error => error.code === 'WORKSPACE_SUBMITTED');
    assert.deepEqual(await readSubmission(submission), [{ path: 'src/main.js', size: 18, content: 'candidate solution' }]);
    await localFileStorage.remove(submission.submittedFiles[0].storageKey);
  } finally { Attempt.findOneAndUpdate = originalUpdate; Submission.create = originalCreate; await localFileStorage.remove(sourceKey); await localFileStorage.remove(changedKey); }
});
