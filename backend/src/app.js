import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import Codebase from './models/Codebase.js';
import { identity, requireCreator } from './identity.js';
import PostCodebaseRouter from './modules/post-codebase/routes.js';
import ViewCodebasesRouter from './modules/view-codebases/routes.js';
import BattlesRouter from './modules/battles/routes.js';

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
app.use('/api/v1/codebase-battles', BattlesRouter);

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
