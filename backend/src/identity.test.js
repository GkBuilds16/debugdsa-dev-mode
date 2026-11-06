import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { identity, requireCreator } from './identity.js';

function invoke(headers = {}) {
  const req = { headers };
  const result = { req, statusCode: 200, body: null, nextCalled: false };
  const res = { status(code) { result.statusCode = code; return this; }, json(body) { result.body = body; return this; } };
  identity(req, res, () => { result.nextCalled = true; });
  return result;
}

test('development identity is explicit and normalized', () => {
  const prior = process.env.AUTH_MODE;
  process.env.AUTH_MODE = 'development';
  const result = invoke();
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.user.id, process.env.DEV_USER_ID || 'local-user');
  if (prior === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = prior;
});

test('JWT mode rejects missing and malformed credentials', () => {
  const prior = process.env.AUTH_MODE; const mode = process.env.NODE_ENV;
  process.env.AUTH_MODE = 'jwt'; process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-only-secret';
  assert.equal(invoke().statusCode, 401);
  assert.equal(invoke({ authorization: 'Bearer invalid' }).statusCode, 401);
  if (prior === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = prior;
  if (mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = mode;
  delete process.env.JWT_SECRET;
});

test('JWT mode derives identity from signed token claims', () => {
  const prior = process.env.AUTH_MODE; const mode = process.env.NODE_ENV;
  process.env.AUTH_MODE = 'jwt'; process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-only-secret';
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ sub: 'user-123', roles: ['creator'], exp: Math.floor(Date.now() / 1000) + 60 });
  const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  const result = invoke({ authorization: `Bearer ${head}.${body}.${sig}` });
  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.req.user, { id: 'user-123', roles: ['creator'] });
  if (prior === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = prior;
  if (mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = mode;
  delete process.env.JWT_SECRET;
});

test('JWT rejects expired, not-yet-active, and extra-segment tokens', () => {
  const prior = { auth: process.env.AUTH_MODE, node: process.env.NODE_ENV, secret: process.env.JWT_SECRET };
  process.env.AUTH_MODE = 'jwt'; process.env.NODE_ENV = 'test'; process.env.JWT_SECRET = 'test-only-secret';
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const signed = claims => {
    const head = b64({ alg: 'HS256' }); const body = b64(claims);
    const sig = crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${head}.${body}`).digest('base64url');
    return `${head}.${body}.${sig}`;
  };
  for (const claims of [
    { sub: 'u1', exp: Math.floor(Date.now() / 1000) - 1 },
    { sub: 'u1', exp: Math.floor(Date.now() / 1000) + 30, nbf: Math.floor(Date.now() / 1000) + 30 }
  ]) assert.equal(invoke({ authorization: `Bearer ${signed(claims)}` }).statusCode, 401);
  assert.equal(invoke({ authorization: `Bearer ${signed({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 60 })}.extra` }).statusCode, 401);
  if (prior.auth === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = prior.auth;
  if (prior.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prior.node;
  if (prior.secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = prior.secret;
});

test('development identity is disabled in production and creator role is enforced', () => {
  const prior = { auth: process.env.AUTH_MODE, node: process.env.NODE_ENV };
  process.env.AUTH_MODE = 'development'; process.env.NODE_ENV = 'production';
  assert.equal(invoke().statusCode, 401);
  const result = { statusCode: 200, body: null, nextCalled: false };
  const res = { status(code) { result.statusCode = code; return this; }, json(body) { result.body = body; return this; } };
  requireCreator({ user: { roles: ['candidate'] } }, res, () => { result.nextCalled = true; });
  assert.equal(result.statusCode, 403);
  requireCreator({ user: { roles: ['creator'] } }, res, () => { result.nextCalled = true; });
  assert.equal(result.nextCalled, true);
  if (prior.auth === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = prior.auth;
  if (prior.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prior.node;
});
