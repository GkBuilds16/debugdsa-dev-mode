import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from './app.js';
import Codebase from './models/Codebase.js';
import Attempt from './models/Attempt.js';
import Submission from './models/Submission.js';
import Bookmark from './models/Bookmark.js';

let server;
let baseUrl;
const original = { auth: process.env.AUTH_MODE, node: process.env.NODE_ENV, devUser: process.env.DEV_USER_ID, find: Codebase.find, count: Codebase.countDocuments, findOne: Codebase.findOne, findOneAndUpdate: Codebase.findOneAndUpdate, save: Codebase.prototype.save, attemptFind: Attempt.findOne, attemptUpdate: Attempt.findOneAndUpdate, submissionFind: Submission.find, submissionFindOne: Submission.findOne, bookmarkFind: Bookmark.find, bookmarkCreate: Bookmark.create, bookmarkDelete: Bookmark.deleteOne };

before(async () => {
  process.env.AUTH_MODE = 'development';
  process.env.NODE_ENV = 'test';
  process.env.DEV_USER_ID = 'local-creator';
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  Codebase.find = original.find;
  Codebase.countDocuments = original.count;
  Codebase.findOne = original.findOne;
  Codebase.findOneAndUpdate = original.findOneAndUpdate;
  Attempt.findOneAndUpdate = original.attemptUpdate;
  Attempt.findOne = original.attemptFind;
  Submission.find = original.submissionFind;
  Submission.findOne = original.submissionFindOne;
  Bookmark.find = original.bookmarkFind;
  Bookmark.create = original.bookmarkCreate;
  Bookmark.deleteOne = original.bookmarkDelete;
  Codebase.prototype.save = original.save;
  if (original.auth === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = original.auth;
  if (original.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original.node;
  if (original.devUser === undefined) delete process.env.DEV_USER_ID; else process.env.DEV_USER_ID = original.devUser;
});

test('mounted health endpoint reports API availability without claiming database connectivity', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.status, 'ok');
  assert.equal(body.data.evaluation, 'disabled');
  assert.equal(typeof body.data.database, 'string');
});

test('public discovery is mounted, published-only, paginated, and omits creator secrets', async () => {
  const source = [{ _id: 'public-id', state: 'PUBLISHED', title: 'Safe challenge', ownerId: 'creator-secret', privateNotes: 'interviewer secret', hiddenTests: [{ input: 'secret case' }] }];
  let query;
  Codebase.countDocuments = async () => 1;
  let sort;
  Codebase.find = filter => {
    query = filter;
    return { select() { return this; }, sort(value) { sort = value; return this; }, skip() { return this; }, limit() { return this; }, async lean() { return source; } };
  };
  const response = await fetch(`${baseUrl}/api/v1/codebases?page=1&limit=1&difficulty=Hard&language=JavaScript&framework=React&tag=cache&q=sync&sort=time`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(query.state, 'PUBLISHED');
  assert.equal(query.difficulty, 'Hard');
  assert.equal(query.languages, 'JavaScript');
  assert.equal(query.frameworks, 'React');
  assert.equal(query.tags, 'cache');
  assert.deepEqual(sort, { estimatedMinutes: 1, createdAt: -1 });
  assert.equal(body.pagination.total, 1);
  assert.equal(body.data[0].title, 'Safe challenge');
  for (const field of ['ownerId', 'privateNotes', 'hiddenTests']) assert.equal(Object.hasOwn(body.data[0], field), false, `${field} must be absent`);
});

test('public detail omits private notes and hidden test payloads', async () => {
  const source = { _id: 'public-id', state: 'PUBLISHED', title: 'Challenge', ownerId: 'creator-secret', privateNotes: 'private', hiddenTests: [{ input: 'secret' }], toObject() { return { ...this }; } };
  Codebase.findOneAndUpdate = filter => ({ select: async () => { assert.equal(filter.state, 'PUBLISHED'); return source; } });
  const response = await fetch(`${baseUrl}/api/v1/codebases/507f1f77bcf86cd799439011`);
  assert.equal(response.status, 200);
  const body = await response.json();
  for (const field of ['ownerId', 'privateNotes', 'hiddenTests']) assert.equal(Object.hasOwn(body.data, field), false, `${field} must be absent`);
});

test('creator detail query scopes the lookup to the authenticated owner', async () => {
  let query;
  Codebase.findOne = filter => {
    query = filter;
    return { select: async () => null };
  };
  const response = await fetch(`${baseUrl}/api/v1/creator/codebases/507f1f77bcf86cd799439011`);
  assert.equal(response.status, 404);
  assert.equal(query.ownerId, process.env.DEV_USER_ID || 'local-creator');
});

test('creator draft creation derives ownership and rejects privileged mass assignment', async () => {
  Codebase.prototype.save = async function saveMock() { return this; };
  const forbidden = await fetch(`${baseUrl}/api/v1/creator/codebases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Test', description: 'Description', ownerId: 'attacker', state: 'PUBLISHED' }) });
  assert.equal(forbidden.status, 422);
  const response = await fetch(`${baseUrl}/api/v1/creator/codebases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Test project', description: 'A test draft' }) });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.data.ownerId, 'local-creator');
  assert.equal(body.data.state, 'DRAFT');
});

test('candidate workspace and submission APIs scope records to the signed-in user', async () => {
  let attemptQuery;
  Codebase.findOne = () => ({ select: async () => ({ _id: '507f1f77bcf86cd799439011', state: 'PUBLISHED', version: 1, files: [] }) });
  Attempt.findOne = filter => { attemptQuery = filter; return { select: async () => null }; };
  const denied = await fetch(`${baseUrl}/api/v1/codebases/507f1f77bcf86cd799439011/workspace/507f1f77bcf86cd799439012`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [], resetPaths: [], revision: 0 })
  });
  assert.equal(denied.status, 404);
  assert.equal(attemptQuery.userId, 'local-creator');

  Codebase.findOne = () => ({ select: async () => ({ _id: '507f1f77bcf86cd799439011', state: 'PUBLISHED', version: 1, files: [{ path: 'src/main.js', size: 1, storageKey: '00000000-0000-4000-8000-000000000000' }] }) });
  Attempt.findOne = filter => { attemptQuery = filter; return { select: async () => ({ _id: '507f1f77bcf86cd799439012', userId: 'local-creator', revision: 0, status: 'IN_PROGRESS', workspaceFiles: [] }) }; };
  const traversal = await fetch(`${baseUrl}/api/v1/codebases/507f1f77bcf86cd799439011/workspace/507f1f77bcf86cd799439012`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [{ path: '../main.js', content: 'x' }], resetPaths: [], revision: 0 }) });
  assert.equal(traversal.status, 422);
  assert.equal(attemptQuery.userId, 'local-creator');

  let submissionQuery;
  Submission.find = filter => {
    submissionQuery = filter;
    return { sort() { return this; }, select(fields) { assert.match(fields, /-submittedFiles/); assert.match(fields, /-result/); return this; }, lean: async () => [{ _id: 'submission-1', attemptId: 'attempt-1', codebaseId: 'codebase-1', publishedVersion: 1, fileCount: 1, userId: 'local-creator', evaluationStatus: 'NOT_EVALUATED' }] };
  };
  const response = await fetch(`${baseUrl}/api/v1/codebases/507f1f77bcf86cd799439011/submissions`);
  assert.equal(response.status, 200);
  assert.equal(submissionQuery.userId, 'local-creator');
  const body = await response.json();
  assert.equal(Object.hasOwn(body.data[0], 'submittedFiles'), false);
  assert.equal(Object.hasOwn(body.data[0], 'result'), false);
});

test('candidate bookmarks reject unpublished codebases and preserve unique ownership', async () => {
  let owner;
  Codebase.findOne = filter => ({ select: async () => { assert.equal(filter.state, 'PUBLISHED'); return { _id: '507f1f77bcf86cd799439011' }; } });
  Bookmark.create = async input => { owner = input; const error = new Error('duplicate'); error.code = 11000; throw error; };
  const response = await fetch(`${baseUrl}/api/v1/codebases/507f1f77bcf86cd799439011/bookmark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 409);
  assert.equal(owner.userId, 'local-creator');
  assert.equal(owner.codebaseId, '507f1f77bcf86cd799439011');
});

test('candidate discovery requires an authenticated identity', async () => {
  const previousAuth = process.env.AUTH_MODE, previousSecret = process.env.JWT_SECRET;
  process.env.AUTH_MODE = 'jwt'; delete process.env.JWT_SECRET;
  try {
    const response = await fetch(`${baseUrl}/api/v1/codebases`);
    assert.equal(response.status, 401);
  } finally {
    if (previousAuth === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = previousAuth;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  }
});

test('every candidate API group rejects requests without a verified identity', async () => {
  const previousAuth = process.env.AUTH_MODE, previousSecret = process.env.JWT_SECRET;
  process.env.AUTH_MODE = 'jwt'; delete process.env.JWT_SECRET;
  try {
    for (const path of ['/api/v1/codebases', '/api/v1/bookmarks', '/api/v1/attempts', '/api/v1/submissions', '/api/v1/progress']) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 401, `${path} must require authentication`);
    }
  } finally {
    if (previousAuth === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = previousAuth;
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  }
});

test('candidate workspace and snapshot reads deny a different candidate and never cross owner scope', async () => {
  const priorUser = process.env.DEV_USER_ID;
  process.env.DEV_USER_ID = 'candidate-b';
  const codebaseId = '507f1f77bcf86cd799439011', workspaceId = '507f1f77bcf86cd799439012', submissionId = '507f1f77bcf86cd799439013';
  let workspaceFilter, submissionFilter;
  Codebase.findOne = filter => ({ select: async () => filter.state === 'PUBLISHED' ? { _id: codebaseId, state: 'PUBLISHED', version: 2, files: [] } : null });
  Attempt.findOne = filter => { workspaceFilter = filter; return { select: async () => null }; };
  Submission.findOne = filter => { submissionFilter = filter; return { select: async () => null }; };
  try {
    const workspaceResponse = await fetch(`${baseUrl}/api/v1/codebases/${codebaseId}/workspace/${workspaceId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: [], resetPaths: [], revision: 0 })
    });
    assert.equal(workspaceResponse.status, 404);
    assert.equal(workspaceFilter.userId, 'candidate-b');
    assert.equal(workspaceFilter.codebaseId, codebaseId);

    const submissionResponse = await fetch(`${baseUrl}/api/v1/submissions/${submissionId}`);
    assert.equal(submissionResponse.status, 404);
    assert.equal(submissionFilter.userId, 'candidate-b');
    assert.equal(submissionFilter._id, submissionId);
  } finally { if (priorUser === undefined) delete process.env.DEV_USER_ID; else process.env.DEV_USER_ID = priorUser; }
});

test('archived challenges cannot open candidate workspaces and active workspaces are bound to the current published version', async () => {
  const codebaseId = '507f1f77bcf86cd799439011';
  let attemptFilter, codebaseFilter;
  Codebase.findOne = filter => { codebaseFilter = filter; return { select: async () => null }; };
  const archived = await fetch(`${baseUrl}/api/v1/codebases/${codebaseId}/workspace`);
  assert.equal(archived.status, 404);
  assert.equal(codebaseFilter.state, 'PUBLISHED');

  Codebase.findOne = filter => ({ select: async () => ({ _id: codebaseId, state: 'PUBLISHED', version: 7, files: [] }) });
  Attempt.findOne = filter => { attemptFilter = filter; return { select: async () => null }; };
  const response = await fetch(`${baseUrl}/api/v1/codebases/${codebaseId}/workspace`);
  assert.equal(response.status, 200);
  assert.equal(attemptFilter.publishedVersion, 7);
  assert.equal(attemptFilter.userId, 'local-creator');
});

test('invalid JSON receives a safe client error response', async () => {
  const response = await fetch(`${baseUrl}/api/v1/creator/codebases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'INVALID_JSON');
  assert.equal(Object.hasOwn(body, 'stack'), false);
});
