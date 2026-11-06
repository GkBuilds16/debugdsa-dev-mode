import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import app from './app.js';
import Codebase from './models/Codebase.js';
import Attempt from './models/Attempt.js';
import Submission from './models/Submission.js';

let server;
let baseUrl;
const original = { auth: process.env.AUTH_MODE, node: process.env.NODE_ENV, devUser: process.env.DEV_USER_ID, find: Codebase.find, count: Codebase.countDocuments, findOne: Codebase.findOne, findOneAndUpdate: Codebase.findOneAndUpdate, save: Codebase.prototype.save, attemptUpdate: Attempt.findOneAndUpdate, submissionFind: Submission.find };

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
  Submission.find = original.submissionFind;
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
  Codebase.find = filter => {
    query = filter;
    return { select() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; }, async lean() { return source; } };
  };
  Codebase.countDocuments = async () => 1;
  const response = await fetch(`${baseUrl}/api/v1/codebases?page=1&limit=1`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(query.state, 'PUBLISHED');
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

test('candidate workspace updates require the owning user and submission lists omit submitted source', async () => {
  let attemptQuery;
  Attempt.findOneAndUpdate = (filter) => { attemptQuery = filter; return null; };
  const denied = await fetch(`${baseUrl}/api/v1/codebases/507f1f77bcf86cd799439011/attempts/507f1f77bcf86cd799439012`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace: [{ path: 'src/main.js', content: 'candidate code' }] })
  });
  assert.equal(denied.status, 404);
  assert.equal(attemptQuery.userId, 'local-creator');

  let submissionQuery;
  Submission.find = filter => {
    submissionQuery = filter;
    return { sort() { return this; }, select: async fields => { assert.match(fields, /-submittedFiles/); assert.match(fields, /-result/); return [{ userId: 'local-creator', evaluationStatus: 'DISABLED' }]; } };
  };
  const response = await fetch(`${baseUrl}/api/v1/codebases/507f1f77bcf86cd799439011/submissions`);
  assert.equal(response.status, 200);
  assert.equal(submissionQuery.userId, 'local-creator');
  const body = await response.json();
  assert.equal(Object.hasOwn(body.data[0], 'submittedFiles'), false);
  assert.equal(Object.hasOwn(body.data[0], 'result'), false);
});

test('invalid JSON receives a safe client error response', async () => {
  const response = await fetch(`${baseUrl}/api/v1/creator/codebases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'INVALID_JSON');
  assert.equal(Object.hasOwn(body, 'stack'), false);
});
