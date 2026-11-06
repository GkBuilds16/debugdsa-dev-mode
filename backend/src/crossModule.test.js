import test from 'node:test';
import assert from 'node:assert/strict';
import Codebase from './models/Codebase.js';
import CodebaseVersion from './models/CodebaseVersion.js';
import Attempt from './models/Attempt.js';
import Submission from './models/Submission.js';
import Battle from './models/Battle.js';
import Registration from './models/Registration.js';
import BattleWorkspace from './models/BattleWorkspace.js';
import { persistProjectFiles, removeProjectFiles } from './modules/post-codebase/services/projectFiles.js';
import { createOrGetWorkspace, materializeWorkspace, createSubmission, readSubmission } from './modules/view-codebases/services/candidateWorkspaceService.js';
import { createBattle, loadChallengeVersion, getCandidateWorkspace } from './modules/battles/services/battleService.js';
import { localFileStorage } from './modules/post-codebase/services/localFileStorage.js';

test('published source version flows into candidate and battle workspaces without crossing snapshots', async () => {
  const originals = {
    codebaseFindOne: Codebase.findOne, codebaseUpdate: Codebase.updateOne,
    versionFind: CodebaseVersion.findOne, attemptFind: Attempt.findOne,
    attemptCreate: Attempt.create, attemptUpdate: Attempt.findOneAndUpdate,
    submissionCreate: Submission.create, battleCreate: Battle.create,
    registrationFind: Registration.findOne, battleWorkspaceFind: BattleWorkspace.findOne,
    battleWorkspaceCreate: BattleWorkspace.create
  };
  const sourceFiles = await persistProjectFiles([{ path: 'src/main.js', content: 'export const bug = true;' }]);
  const version = {
    _id: 'version-id', codebaseId: 'codebase-id', version: 4,
    snapshot: { title: 'Published challenge', difficulty: 'Medium', languages: ['JavaScript'], files: sourceFiles }
  };
  const codebase = { _id: 'codebase-id', ownerId: 'creator-id', state: 'PUBLISHED', version: 4, files: sourceFiles };
  const candidateAttempt = { _id: 'attempt-id', codebaseId: 'codebase-id', publishedVersion: 4, publishedVersionId: 'version-id', userId: 'candidate-id', status: 'IN_PROGRESS', revision: 0, workspaceFiles: [] };
  let candidateSnapshot;
  let battleWorkspace;
  const battle = { _id: 'battle-id', codebaseId: 'codebase-id', codebaseVersionId: 'version-id', codebaseVersion: 4, status: 'LIVE', startsAt: new Date(Date.now() - 60_000), registrationDeadline: new Date(Date.now() - 90_000), durationMinutes: 30 };

  try {
    Codebase.findOne = async query => { assert.equal(String(query._id), 'codebase-id'); assert.equal(query.ownerId, 'creator-id'); return codebase; };
    Codebase.updateOne = async () => ({ acknowledged: true });
    CodebaseVersion.findOne = query => {
      assert.equal(String(query.codebaseId), 'codebase-id');
      assert.equal(query.version, 4);
      if (query._id) assert.equal(String(query._id), 'version-id');
      return { select: async () => version };
    };
    Attempt.findOne = query => {
      assert.equal(query.userId, 'candidate-id');
      assert.equal(query.publishedVersion, 4);
      return { select: async () => null };
    };
    Attempt.create = async value => ({ ...candidateAttempt, ...value });
    const candidate = await createOrGetWorkspace(codebase, 'candidate-id');
    assert.equal(candidate.publishedVersionId, 'version-id');
    assert.equal((await materializeWorkspace(codebase, candidate))[0].content, 'export const bug = true;');

    Submission.create = async value => { candidateSnapshot = { _id: 'submission-id', ...value }; return candidateSnapshot; };
    Attempt.findOneAndUpdate = async query => {
      assert.equal(query._id, 'attempt-id');
      assert.equal(query.userId, 'candidate-id');
      return { ...candidateAttempt, status: 'SUBMITTED', revision: 1 };
    };
    const submission = await createSubmission(codebase, candidate, 0);
    assert.equal(submission.publishedVersionId, 'version-id');
    assert.equal((await readSubmission(submission))[0].content, 'export const bug = true;');

    Battle.create = async value => ({ _id: 'battle-id', ...value });
    const createdBattle = await createBattle('creator-id', { codebaseId: 'codebase-id', codebaseVersion: 4 });
    assert.equal(String(createdBattle.codebaseVersionId), 'version-id');
    assert.equal(createdBattle.challengeTitle, 'Published challenge');
    assert.equal((await loadChallengeVersion(createdBattle, true)).snapshot.files[0].content, 'export const bug = true;');

    Registration.findOne = async query => {
      assert.equal(query.battleId, 'battle-id');
      assert.equal(query.userId, 'candidate-id');
      assert.equal(query.status, 'REGISTERED');
      return { _id: 'registration-id' };
    };
    BattleWorkspace.findOne = () => ({ select: async () => null });
    BattleWorkspace.create = async value => { battleWorkspace = { _id: 'battle-workspace-id', ...value }; return battleWorkspace; };
    const liveBattle = { ...createdBattle, status: 'LIVE', startsAt: new Date(Date.now() - 60_000), durationMinutes: 30 };
    const opened = await getCandidateWorkspace(liveBattle, 'candidate-id', new Date(), true);
    assert.equal(String(opened.workspace.codebaseVersionId), 'version-id');
    assert.equal(opened.files[0].content, 'export const bug = true;');
  } finally {
    Codebase.findOne = originals.codebaseFindOne; Codebase.updateOne = originals.codebaseUpdate;
    CodebaseVersion.findOne = originals.versionFind; Attempt.findOne = originals.attemptFind;
    Attempt.create = originals.attemptCreate; Attempt.findOneAndUpdate = originals.attemptUpdate;
    Submission.create = originals.submissionCreate; Battle.create = originals.battleCreate;
    Registration.findOne = originals.registrationFind; BattleWorkspace.findOne = originals.battleWorkspaceFind;
    BattleWorkspace.create = originals.battleWorkspaceCreate;
    await removeProjectFiles(sourceFiles);
    await Promise.all((candidateSnapshot?.submittedFiles || []).map(file => localFileStorage.remove(file.storageKey)));
  }
});
