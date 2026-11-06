import express from 'express';
import mongoose from 'mongoose';
import Codebase from '../../models/Codebase.js';
import Attempt from '../../models/Attempt.js';
import Bookmark from '../../models/Bookmark.js';
import Submission from '../../models/Submission.js';
import { identity } from '../../identity.js';
import { validateCandidatePath, validateWorkspaceFiles } from './validators/candidateInput.js';
import { createOrGetWorkspace, createSubmission, findPublishedCodebase, materializeWorkspace, readSubmission, saveWorkspace } from './services/candidateWorkspaceService.js';
import { serializeAttemptSummary, serializeSubmissionSummary, serializeWorkspace } from './serializers/candidateSerializer.js';
import { getPublishedCodebase, getPublishedFile, getPublishedFileTree, listPublishedCodebases } from './controllers/discoveryController.js';

const router = express.Router();
const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const idOk = id => mongoose.isValidObjectId(id);
const privateRoutes = express.Router();
for (const basePath of ['/codebases', '/bookmarks', '/attempts', '/submissions', '/progress']) router.use(basePath, identity);

router.get('/codebases', wrap(listPublishedCodebases));
router.get('/codebases/:id', wrap(getPublishedCodebase));
router.get('/codebases/:id/files', wrap(getPublishedFileTree));
router.get('/codebases/:id/file', wrap(getPublishedFile));

privateRoutes.get('/codebases/:id/workspace', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const codebase = await findPublishedCodebase(req.params.id); if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const attempt = await Attempt.findOne({ codebaseId: codebase._id, publishedVersion: codebase.version || 1, userId: req.user.id, status: 'IN_PROGRESS' }).select('+workspaceFiles.storageKey');
  if (!attempt) return res.json({ success: true, data: null });
  res.json({ success: true, data: serializeWorkspace(attempt, await materializeWorkspace(codebase, attempt)) });
}));

privateRoutes.post('/codebases/:id/workspace', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const codebase = await findPublishedCodebase(req.params.id); if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const attempt = await createOrGetWorkspace(codebase, req.user.id);
  res.status(201).json({ success: true, data: serializeWorkspace(attempt, await materializeWorkspace(codebase, attempt)) });
}));
// Preserve Phase 1 attempt route names while storing only candidate-owned file overrides.
privateRoutes.post('/codebases/:id/attempts', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const codebase = await findPublishedCodebase(req.params.id); if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const attempt = await createOrGetWorkspace(codebase, req.user.id);
  res.status(201).json({ success: true, data: serializeWorkspace(attempt, await materializeWorkspace(codebase, attempt)) });
}));

privateRoutes.patch('/codebases/:id/workspace/:attemptId', wrap(async (req, res) => {
  const body = req.body || {};
  if (!idOk(req.params.id) || !idOk(req.params.attemptId)) return fail(res, 400, 'INVALID_ID', 'An identifier is invalid.');
  const codebase = await findPublishedCodebase(req.params.id); if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const attempt = await Attempt.findOne({ _id: req.params.attemptId, codebaseId: codebase._id, userId: req.user.id, status: 'IN_PROGRESS' }).select('+workspaceFiles.storageKey');
  if (!attempt) return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Active candidate workspace was not found.');
  let files; try { files = validateWorkspaceFiles(body.files, (codebase.files || []).map(file => file.path)); } catch (error) { return fail(res, 422, 'INVALID_WORKSPACE', error.message); }
  let resetPaths; try {
    const allowed = new Set((codebase.files || []).map(file => file.path));
    if (!Array.isArray(body.resetPaths) || body.resetPaths.length > 300) throw new Error('resetPaths must be a list of source paths.');
    resetPaths = body.resetPaths.map(validateCandidatePath);
    if (resetPaths.some(path => !allowed.has(path)) || new Set(resetPaths).size !== resetPaths.length) throw new Error('Reset paths must refer to unique files in this codebase.');
  } catch (error) { return fail(res, 422, 'INVALID_WORKSPACE', error.message); }
  if (!files.length && !resetPaths.length) return res.json({ success: true, data: { id: String(attempt._id), revision: attempt.revision, status: attempt.status } });
  const saved = await saveWorkspace(attempt, files, body.revision, resetPaths, codebase.files);
  res.json({ success: true, data: { id: String(saved._id), revision: saved.revision, status: saved.status, updatedAt: saved.updatedAt } });
}));
privateRoutes.patch('/codebases/:id/attempts/:attemptId', wrap(async (req, res) => {
  const body = req.body || {};
  if (!idOk(req.params.id) || !idOk(req.params.attemptId)) return fail(res, 400, 'INVALID_ID', 'An identifier is invalid.');
  const codebase = await findPublishedCodebase(req.params.id); if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const attempt = await Attempt.findOne({ _id: req.params.attemptId, codebaseId: codebase._id, userId: req.user.id, status: 'IN_PROGRESS' }).select('+workspaceFiles.storageKey');
  if (!attempt) return fail(res, 404, 'ATTEMPT_NOT_FOUND', 'Active candidate workspace was not found.');
  let files; try { files = validateWorkspaceFiles(body.workspace, (codebase.files || []).map(file => file.path)); } catch (error) { return fail(res, 422, 'INVALID_WORKSPACE', error.message); }
  const saved = await saveWorkspace(attempt, files, body.revision, [], codebase.files);
  res.json({ success: true, data: serializeWorkspace(saved, await materializeWorkspace(codebase, saved)) });
}));

privateRoutes.post('/codebases/:id/workspace/:attemptId/reset', wrap(async (req, res) => {
  const body = req.body || {};
  if (!idOk(req.params.id) || !idOk(req.params.attemptId)) return fail(res, 400, 'INVALID_ID', 'An identifier is invalid.');
  const codebase = await findPublishedCodebase(req.params.id); if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const attempt = await Attempt.findOne({ _id: req.params.attemptId, codebaseId: codebase._id, userId: req.user.id, status: 'IN_PROGRESS' }).select('+workspaceFiles.storageKey');
  if (!attempt) return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Active candidate workspace was not found.');
  const saved = await saveWorkspace(attempt, [], body.revision, (codebase.files || []).map(file => file.path), codebase.files);
  res.json({ success: true, data: serializeWorkspace(saved, await materializeWorkspace(codebase, saved)) });
}));

privateRoutes.post('/codebases/:id/submissions', wrap(async (req, res) => {
  const body = req.body || {};
  if (!idOk(req.params.id) || !idOk(body.attemptId)) return fail(res, 400, 'INVALID_ID', 'An identifier is invalid.');
  const codebase = await findPublishedCodebase(req.params.id); if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const attempt = await Attempt.findOne({ _id: body.attemptId, codebaseId: codebase._id, userId: req.user.id, status: 'IN_PROGRESS' }).select('+workspaceFiles.storageKey');
  if (!attempt) return fail(res, 404, 'WORKSPACE_NOT_FOUND', 'Active candidate workspace was not found.');
  try {
    const submission = await createSubmission(codebase, attempt, body.revision);
    res.status(201).json({ success: true, data: serializeSubmissionSummary(submission) });
  } catch (error) { if (error.code === 11000) return fail(res, 409, 'ALREADY_SUBMITTED', 'This workspace already has a submission.'); throw error; }
}));

privateRoutes.get('/codebases/:id/submissions', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const rows = await Submission.find({ codebaseId: req.params.id, userId: req.user.id }).sort({ createdAt: -1 }).select('-submittedFiles -result').lean();
  res.json({ success: true, data: rows.map(serializeSubmissionSummary) });
}));

privateRoutes.get('/submissions/:submissionId', wrap(async (req, res) => {
  if (!idOk(req.params.submissionId)) return fail(res, 400, 'INVALID_ID', 'Submission ID is invalid.');
  const submission = await Submission.findOne({ _id: req.params.submissionId, userId: req.user.id }).select('+submittedFiles +submittedFiles.storageKey');
  if (!submission) return fail(res, 404, 'NOT_FOUND', 'Submission was not found.');
  res.json({ success: true, data: { ...serializeSubmissionSummary(submission), files: await readSubmission(submission) } });
}));

privateRoutes.get('/codebases/:id/attempts', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const rows = await Attempt.find({ codebaseId: req.params.id, userId: req.user.id }).sort({ createdAt: -1 }).select('-workspaceFiles -userId -__v').lean();
  res.json({ success: true, data: rows.map(serializeAttemptSummary) });
}));
privateRoutes.get('/attempts', wrap(async (req, res) => {
  const attempts = await Attempt.find({ userId: req.user.id }).sort({ updatedAt: -1 }).select('-workspaceFiles -userId -__v').lean();
  const submissions = await Submission.find({ userId: req.user.id }).sort({ createdAt: -1 }).select('-submittedFiles -result').lean();
  res.json({ success: true, data: { attempts: attempts.map(serializeAttemptSummary), submissions: submissions.map(serializeSubmissionSummary) } });
}));
privateRoutes.get('/submissions', wrap(async (req, res) => {
  const filter = { userId: req.user.id };
  if (typeof req.query.codebaseId === 'string') { if (!idOk(req.query.codebaseId)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.'); filter.codebaseId = req.query.codebaseId; }
  const rows = await Submission.find(filter).sort({ createdAt: -1 }).select('-submittedFiles -result').lean();
  res.json({ success: true, data: rows.map(serializeSubmissionSummary) });
}));

privateRoutes.post('/codebases/:id/bookmark', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const codebase = await Codebase.findOne({ _id: req.params.id, state: 'PUBLISHED' }).select('_id');
  if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  try { const bookmark = await Bookmark.create({ codebaseId: codebase._id, userId: req.user.id }); res.status(201).json({ success: true, data: { id: bookmark.id, codebaseId: String(codebase._id) } }); }
  catch (error) { if (error.code === 11000) return fail(res, 409, 'ALREADY_BOOKMARKED', 'Codebase is already bookmarked.'); throw error; }
}));
privateRoutes.delete('/codebases/:id/bookmark', wrap(async (req, res) => {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  await Bookmark.deleteOne({ codebaseId: req.params.id, userId: req.user.id }); res.status(204).end();
}));
privateRoutes.get('/bookmarks', wrap(async (req, res) => {
  const rows = await Bookmark.find({ userId: req.user.id }).sort({ createdAt: -1 }).populate({ path: 'codebaseId', match: { state: 'PUBLISHED' }, select: '-ownerId -files -directories -privateNotes -intendedBugExplanation -solutionApproach -evaluationRubric -hiddenRequirements -internalReferences -hiddenTests' }).lean();
  res.json({ success: true, data: rows.filter(row => row.codebaseId).map(row => ({ id: row._id, codebase: serializeCandidateSummary(row.codebaseId, { bookmarked: true }), createdAt: row.createdAt })) });
}));
privateRoutes.get('/progress', wrap(async (req, res) => {
  const [attempts, bookmarks] = await Promise.all([Attempt.find({ userId: req.user.id }).select('codebaseId status updatedAt').sort({ updatedAt: -1 }).lean(), Bookmark.find({ userId: req.user.id }).select('codebaseId').lean()]);
  const ids = [...new Set([...attempts.map(row => String(row.codebaseId)), ...bookmarks.map(row => String(row.codebaseId))])];
  const published = await Codebase.find({ _id: { $in: ids }, state: 'PUBLISHED' }).select('_id').lean();
  const available = new Set(published.map(row => String(row._id))); const progress = {};
  for (const attempt of attempts) if (available.has(String(attempt.codebaseId)) && !progress[String(attempt.codebaseId)]) progress[String(attempt.codebaseId)] = attempt.status === 'SUBMITTED' ? 'SUBMITTED' : 'IN_PROGRESS';
  res.json({ success: true, data: { progress, bookmarks: bookmarks.map(row => String(row.codebaseId)).filter(id => available.has(id)) } });
}));

router.use(privateRoutes);
export default router;
