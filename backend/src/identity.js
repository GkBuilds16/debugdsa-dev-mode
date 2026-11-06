import crypto from 'node:crypto';

const decode = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

export function identity(req, res, next) {
  if (process.env.AUTH_MODE === 'development' && [undefined, 'development', 'test'].includes(process.env.NODE_ENV)) {
    req.user = { id: process.env.DEV_USER_ID || 'local-user', roles: ['creator', 'admin'] };
    return next();
  }
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in is required.' } });
  try {
    const [header, payload, signature] = token.split('.');
    if (token.length > 8192 || token.split('.').length !== 3 || !header || !payload || !signature || decode(header).alg !== 'HS256') throw new Error('invalid token');
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    const a = Buffer.from(signature), b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error('invalid signature');
    const claims = decode(payload);
    if (!Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw new Error('expired');
    if (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf * 1000 > Date.now())) throw new Error('not active');
    const id = claims.id || claims.sub || claims.userId;
    if (!id) throw new Error('missing identity');
    req.user = { id: String(id), roles: Array.isArray(claims.roles) ? claims.roles : claims.role ? [claims.role] : [] };
    next();
  } catch {
    res.status(401).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Authentication token is invalid.' } });
  }
}

export const requireRole = role => (req, res, next) => req.user?.roles.includes(role)
  ? next()
  : res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'This action is not permitted.' } });

export const requireCreator = (req, res, next) => req.user?.roles.some(role => ['creator', 'admin'].includes(role))
  ? next()
  : res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Creator access is required.' } });
