import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import Codebase from './models/Codebase.js';
import Battle from './models/Battle.js';
import Registration from './models/Registration.js';
import Bookmark from './models/Bookmark.js';
import Attempt from './models/Attempt.js';
import Submission from './models/Submission.js';
import { identity, requireCreator } from './identity.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: process.env.MAX_JSON_BYTES || '1mb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
const api = express.Router();
const idOk = id => mongoose.isValidObjectId(id);
const publicCodebase = doc => {
  const item = doc.toObject ? doc.toObject() : doc;
  delete item.privateNotes; delete item.hiddenTests; delete item.ownerId; delete item.__v;
  return item;
};
const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

api.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', evaluation: 'disabled' } }));

// Discovery endpoints only query published records and serialize public fields.
api.get('/codebases', wrap(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
  const filter = { state: 'PUBLISHED' };
  if (['Easy', 'Medium', 'Hard'].includes(req.query.difficulty)) filter.difficulty = req.query.difficulty;
  if (req.query.language) filter.languages = req.query.language;
  if (req.query.q?.trim()) filter.$text = { $search: req.query.q.trim().slice(0, 100) };
  const sort = req.query.sort === 'popular' ? { viewCount: -1, createdAt: -1 } : { createdAt: -1 };
  const [rows, total] = await Promise.all([Codebase.find(filter).select('-privateNotes -hiddenTests -ownerId').sort(sort).skip((page - 1) * limit).limit(limit).lean(), Codebase.countDocuments(filter)]);
  res.json({ success: true, data: rows.map(publicCodebase), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));
api.get('/codebases/:id', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const doc = await Codebase.findOneAndUpdate({ _id: req.params.id, state: 'PUBLISHED' }, { $inc: { viewCount: 1 } }, { new: true }).select('-privateNotes -hiddenTests -ownerId');
  if (!doc) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  res.json({ success: true, data: publicCodebase(doc) });
}));
app.use('/api/v1', api);

const candidate = express.Router(); candidate.use(identity);
candidate.post('/codebases/:id/bookmark', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const codebase = await Codebase.findOne({ _id: req.params.id, state: 'PUBLISHED' }).select('_id');
  if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  try { const row = await Bookmark.create({ codebaseId: codebase.id, userId: req.user.id }); res.status(201).json({ success: true, data: row }); }
  catch (error) { if (error.code === 11000) return fail(res, 409, 'ALREADY_BOOKMARKED', 'Codebase is already bookmarked.'); throw error; }
}));
candidate.delete('/codebases/:id/bookmark', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  await Bookmark.deleteOne({ codebaseId: req.params.id, userId: req.user.id }); res.status(204).end();
}));
candidate.get('/codebases/:id/attempts', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const rows = await Attempt.find({ codebaseId: req.params.id, userId: req.user.id }).sort({ updatedAt: -1 }).select('-workspace');
  res.json({ success: true, data: rows });
}));
candidate.post('/codebases/:id/attempts', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const codebase = await Codebase.findOne({ _id: req.params.id, state: 'PUBLISHED' }).select('files');
  if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const attempt = await Attempt.create({ codebaseId: codebase.id, userId: req.user.id, workspace: codebase.files.map(file => ({ path: file.path, content: file.content })) });
  await Codebase.updateOne({ _id: codebase.id }, { $inc: { attemptCount: 1 } });
  res.status(201).json({ success: true, data: attempt });
}));
candidate.patch('/codebases/:id/attempts/:attemptId', wrap(async (req, res) => {
  if (!idOk(req.params.id) || !idOk(req.params.attemptId)) return fail(res, 400, 'INVALID_ID', 'An identifier is invalid.');
  if (!Array.isArray(req.body.workspace) || req.body.workspace.length > 500 || req.body.workspace.some(file => typeof file.path !== 'string' || file.path.startsWith('/') || file.path.split(/[\\/]/).includes('..') || typeof file.content !== 'string')) return fail(res, 422, 'INVALID_WORKSPACE', 'Workspace files are invalid.');
  const attempt = await Attempt.findOneAndUpdate({ _id: req.params.attemptId, codebaseId: req.params.id, userId: req.user.id, status: 'IN_PROGRESS' }, { $set: { workspace: req.body.workspace } }, { new: true, runValidators: true });
  if (!attempt) return fail(res, 404, 'ATTEMPT_NOT_FOUND', 'Active attempt was not found.');
  res.json({ success: true, data: attempt });
}));
candidate.post('/codebases/:id/submissions', wrap(async (req, res) => {
  if (!idOk(req.params.id) || !idOk(req.body.attemptId)) return fail(res, 400, 'INVALID_ID', 'An identifier is invalid.');
  const attempt = await Attempt.findOne({ _id: req.body.attemptId, codebaseId: req.params.id, userId: req.user.id, status: 'IN_PROGRESS' });
  if (!attempt) return fail(res, 404, 'ATTEMPT_NOT_FOUND', 'Active attempt was not found.');
  const submission = await Submission.create({ attemptId: attempt.id, codebaseId: attempt.codebaseId, userId: req.user.id, submittedFiles: attempt.workspace, evaluationStatus: 'DISABLED', result: null });
  attempt.lastSubmissionAt = new Date(); await attempt.save();
  res.status(201).json({ success: true, data: { id: submission.id, createdAt: submission.createdAt, evaluationStatus: 'DISABLED', message: 'Submission saved. Code execution is not configured.' } });
}));
candidate.get('/codebases/:id/submissions', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const rows = await Submission.find({ codebaseId: req.params.id, userId: req.user.id }).sort({ createdAt: -1 }).select('-submittedFiles -result');
  res.json({ success: true, data: rows });
}));
candidate.get('/bookmarks', wrap(async (req, res) => {
  const rows = await Bookmark.find({ userId: req.user.id }).sort({ createdAt: -1 }).populate({ path: 'codebaseId', match: { state: 'PUBLISHED' }, select: 'title description difficulty languages technologies tags state' }).lean();
  res.json({ success: true, data: rows.filter(row => row.codebaseId).map(row => ({ id: row._id, codebase: row.codebaseId, createdAt: row.createdAt })) });
}));
app.use('/api/v1', candidate);

const creator = express.Router(); creator.use(identity, requireCreator);
creator.get('/codebases', wrap(async (req, res) => {
  const rows = await Codebase.find({ ownerId: req.user.id }).select('-privateNotes -hiddenTests').sort({ updatedAt: -1 }).lean();
  res.json({ success: true, data: rows.map(row => ({ ...row, ownerId: undefined })) });
}));
creator.post('/codebases', wrap(async (req, res) => {
  const { title, description } = req.body;
  if (typeof title !== 'string' || !title.trim() || typeof description !== 'string' || !description.trim()) return fail(res, 422, 'VALIDATION_ERROR', 'Title and short description are required.');
  const doc = await Codebase.create({ ...req.body, ownerId: req.user.id, title: title.trim(), description: description.trim(), state: 'DRAFT' });
  res.status(201).json({ success: true, data: doc });
}));
creator.get('/codebases/:id', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const doc = await Codebase.findOne({ _id: req.params.id, ownerId: req.user.id }).select('+privateNotes +hiddenTests');
  if (!doc) return fail(res, 404, 'NOT_FOUND', 'Codebase was not found.');
  res.json({ success: true, data: doc });
}));
creator.patch('/codebases/:id', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const doc = await Codebase.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!doc) return fail(res, 404, 'NOT_FOUND', 'Codebase was not found.');
  if (doc.state === 'ARCHIVED') return fail(res, 409, 'INVALID_STATE', 'Archived codebases cannot be edited.');
  if (req.body.version !== undefined && Number(req.body.version) !== doc.version) return fail(res, 409, 'VERSION_CONFLICT', 'This codebase changed since you opened it. Reload and retry.');
  const allowed = ['title', 'description', 'problemStatement', 'category', 'difficulty', 'languages', 'technologies', 'tags', 'sourceUrl', 'instructions', 'publicHints', 'privateNotes', 'hiddenTests', 'files'];
  for (const key of allowed) if (Object.hasOwn(req.body, key)) doc.set(key, req.body[key]);
  doc.version += 1;
  await doc.save();
  res.json({ success: true, data: doc });
}));
creator.post('/codebases/:id/publish', wrap(async (req, res) => {
  const doc = idOk(req.params.id) && await Codebase.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!doc) return fail(res, 404, 'NOT_FOUND', 'Codebase was not found.');
  if (doc.state !== 'DRAFT' || !doc.title || !doc.description || !doc.problemStatement || !doc.files.length) return fail(res, 422, 'PUBLISH_VALIDATION', 'Draft needs a title, description, problem statement, and at least one source file before publishing.');
  doc.state = 'PUBLISHED'; doc.version += 1; await doc.save();
  res.json({ success: true, data: publicCodebase(doc) });
}));
creator.post('/codebases/:id/archive', wrap(async (req, res) => {
  const doc = idOk(req.params.id) && await Codebase.findOne({ _id: req.params.id, ownerId: req.user.id });
  if (!doc) return fail(res, 404, 'NOT_FOUND', 'Codebase was not found.');
  doc.state = 'ARCHIVED'; doc.version += 1; await doc.save(); res.json({ success: true, data: { id: doc.id, state: doc.state } });
}));
creator.delete('/codebases/:id', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const doc = await Codebase.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id, state: 'DRAFT' });
  if (!doc) return fail(res, 404, 'NOT_FOUND', 'Only your drafts can be permanently deleted.');
  res.status(204).end();
}));
app.use('/api/v1/creator', creator);

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
  if (err.type === 'entity.too.large') return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the configured size limit.');
  if (err instanceof SyntaxError && err.status === 400 && Object.hasOwn(err, 'body')) return fail(res, 400, 'INVALID_JSON', 'Request body must contain valid JSON.');
  if (err.name === 'ValidationError') return fail(res, 422, 'VALIDATION_ERROR', 'Submitted values are invalid.');
  if (err.name === 'CastError') return fail(res, 400, 'INVALID_ID', 'A supplied identifier is invalid.');
  if (err.name === 'VersionError') return fail(res, 409, 'VERSION_CONFLICT', 'This record changed since it was loaded. Reload and retry.');
  console.error(JSON.stringify({ level: 'error', name: err.name || 'Error', type: err.type || 'internal' }));
  fail(res, 500, 'INTERNAL_ERROR', 'An internal error occurred.');
});
export default app;
