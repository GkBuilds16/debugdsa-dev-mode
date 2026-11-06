import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import Codebase from './models/Codebase.js';
import Battle from './models/Battle.js';
import Registration from './models/Registration.js';
import { identity, requireCreator } from './identity.js';
import PostCodebaseRouter from './modules/post-codebase/routes.js';
import ViewCodebasesRouter from './modules/view-codebases/routes.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: process.env.MAX_JSON_BYTES || '4mb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
const api = express.Router();
const idOk = id => mongoose.isValidObjectId(id);
const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

api.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', evaluation: 'disabled' } }));
app.use('/api/v1', ViewCodebasesRouter);
app.use('/api/v1', api);
app.use('/api/v1/creator', PostCodebaseRouter);

const battles = express.Router(); battles.use(identity);
battles.get('/', wrap(async (_req, res) => {
  const rows = await Battle.find({ status: { $nin: ['CANCELLED'] } }).sort({ startsAt: 1 }).lean();
  res.json({ success: true, data: rows });
}));
battles.post('/', requireCreator, wrap(async (req, res) => {
  const { codebaseId, title, startsAt, registrationDeadline, durationMinutes } = req.body;
  if (!idOk(codebaseId) || !title || !startsAt || !registrationDeadline || !durationMinutes) return fail(res, 422, 'VALIDATION_ERROR', 'Codebase, title, start, registration deadline and duration are required.');
  const codebase = await Codebase.findOne({ _id: codebaseId, ownerId: req.user.id, state: 'PUBLISHED' }).select('_id');
  if (!codebase) return fail(res, 404, 'CODEBASE_NOT_FOUND', 'Choose one of your published codebases.');
  const start = new Date(startsAt), deadline = new Date(registrationDeadline);
  if (!Number.isFinite(+start) || !Number.isFinite(+deadline) || deadline > start || start <= new Date()) return fail(res, 422, 'INVALID_SCHEDULE', 'Registration deadline must precede a future battle start time.');
  const battle = await Battle.create({ ...req.body, ownerId: req.user.id, startsAt: start, registrationDeadline: deadline, status: new Date() < deadline ? 'REGISTRATION_OPEN' : 'UPCOMING' });
  res.status(201).json({ success: true, data: battle });
}));
battles.post('/:id/register', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.');
  const battle = await Battle.findById(req.params.id);
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  const now = new Date();
  if (now >= battle.registrationDeadline || now >= battle.startsAt || ['CANCELLED', 'FINISHED'].includes(battle.status)) return fail(res, 409, 'REGISTRATION_CLOSED', 'Registration has closed.');
  const slot = await Battle.findOneAndUpdate({ _id: battle.id, registrationDeadline: { $gt: now }, startsAt: { $gt: now }, $expr: { $lt: ['$registrationCount', '$capacity'] } }, { $inc: { registrationCount: 1 } }, { new: true });
  if (!slot) return fail(res, 409, 'BATTLE_FULL', 'This battle is full or registration has closed.');
  try { const registration = await Registration.create({ battleId: battle.id, userId: req.user.id }); res.status(201).json({ success: true, data: registration }); }
  catch (error) {
    await Battle.updateOne({ _id: battle.id, registrationCount: { $gt: 0 } }, { $inc: { registrationCount: -1 } });
    if (error.code === 11000) return fail(res, 409, 'ALREADY_REGISTERED', 'You are already registered.');
    throw error;
  }
}));
battles.get('/:id/leaderboard', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Battle ID is invalid.');
  const battle = await Battle.findById(req.params.id).select('_id status');
  if (!battle) return fail(res, 404, 'NOT_FOUND', 'Battle was not found.');
  res.json({ success: true, data: [], meta: { status: battle.status, evaluation: 'DISABLED', note: 'Rankings are unavailable until a genuine isolated evaluator is configured.' } });
}));
app.use('/api/v1/codebase-battles', battles);

app.use((_req, res) => fail(res, 404, 'NOT_FOUND', 'Route was not found.'));
app.use((err, _req, res, _next) => {
  if (err.name === 'MulterError') return fail(res, err.code === 'LIMIT_FILE_SIZE' ? 413 : 400, err.code || 'UPLOAD_ERROR', err.code === 'LIMIT_FILE_SIZE' ? 'ZIP archive exceeds the 10 MiB upload limit.' : 'Upload must contain one ZIP archive and no extra fields.');
  if (err.type === 'entity.too.large') return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the configured size limit.');
  if (err instanceof SyntaxError && err.status === 400 && Object.hasOwn(err, 'body')) return fail(res, 400, 'INVALID_JSON', 'Request body must contain valid JSON.');
  if (err.name === 'ValidationError') return fail(res, 422, 'VALIDATION_ERROR', 'Submitted values are invalid.');
  if (err.name === 'CastError') return fail(res, 400, 'INVALID_ID', 'A supplied identifier is invalid.');
  if (err.name === 'VersionError') return fail(res, 409, 'VERSION_CONFLICT', 'This record changed since it was loaded. Reload and retry.');
  if (err.code === 'WORKSPACE_CONFLICT') return fail(res, 409, err.code, err.message);
  if (err.code === 'WORKSPACE_SUBMITTED') return fail(res, 409, err.code, err.message);
  if (err.code === 'WORKSPACE_TOO_LARGE') return fail(res, 413, err.code, err.message);
  console.error(JSON.stringify({ level: 'error', name: err.name || 'Error', type: err.type || 'internal' }));
  fail(res, 500, 'INTERNAL_ERROR', 'An internal error occurred.');
});
export default app;
