import express from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import Codebase from '../../models/Codebase.js';
import CodebaseVersion from '../../models/CodebaseVersion.js';
import { identity, requireCreator } from '../../identity.js';
import { fileTree, readProjectFiles, updateStoredProjectFile } from './services/projectFiles.js';
import { normalizeProjectPath, MAX_ARCHIVE_BYTES, validateProjectFiles } from './services/filePolicy.js';
import { extractSafeZip } from './services/zipImport.js';
import { parsePublicGitHubUrl, importPublicGitHubRepository } from './services/githubImport.js';
import { createDraft, deleteDraft, forkPublishedVersion, getOwnedCodebase, hydrateFiles, publishDraft, replaceFiles, restoreArchived, updateDraft } from './services/codebaseService.js';
import { serializeCreatorCodebase, serializeDashboardCodebase, serializePublicCodebase } from './serializers/codebaseSerializer.js';
import { validateCodebaseInput } from './validators/codebaseInput.js';

const router = express.Router();
router.use(identity, requireCreator);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ARCHIVE_BYTES, files: 1, fields: 0 } });
const fail = (res, status, code, message, details) => res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const validId = id => mongoose.isValidObjectId(id);
const editable = async (req, res) => {
  if (!validId(req.params.id)) { fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.'); return null; }
  const doc = await getOwnedCodebase(req.params.id, req.user.id);
  if (!doc) fail(res, 404, 'NOT_FOUND', 'Codebase was not found.');
  return doc;
};
const saveFiles = async (doc, files) => replaceFiles(doc, files);

router.get('/dashboard', wrap(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const filter = { ownerId: req.user.id };
  if (['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(req.query.status)) filter.state = req.query.status;
  if (['Easy', 'Medium', 'Hard'].includes(req.query.difficulty)) filter.difficulty = req.query.difficulty;
  if (typeof req.query.language === 'string' && req.query.language.length <= 30) filter.languages = req.query.language;
  if (typeof req.query.framework === 'string' && req.query.framework.length <= 40) filter.frameworks = req.query.framework;
  if (typeof req.query.q === 'string' && req.query.q.trim()) filter.$text = { $search: req.query.q.trim().slice(0, 100) };
  const sorters = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, updated: { updatedAt: -1 }, title: { title: 1 } };
  const sort = sorters[req.query.sort] || sorters.updated;
  const [rows, total, groups] = await Promise.all([
    Codebase.find(filter).select('-privateNotes -intendedBugExplanation -solutionApproach -evaluationRubric -hiddenRequirements -internalReferences -hiddenTests -files -directories').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Codebase.countDocuments(filter),
    Codebase.aggregate([{ $match: { ownerId: req.user.id } }, { $group: { _id: '$state', count: { $sum: 1 } } }])
  ]);
  const metrics = { total: 0, drafts: 0, published: 0, archived: 0 };
  for (const group of groups) { metrics.total += group.count; if (group._id === 'DRAFT') metrics.drafts = group.count; if (group._id === 'PUBLISHED') metrics.published = group.count; if (group._id === 'ARCHIVED') metrics.archived = group.count; }
  res.json({ success: true, data: rows.map(serializeDashboardCodebase), metrics, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get('/codebases', wrap(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const rows = await Codebase.find({ ownerId: req.user.id }).select('-privateNotes -intendedBugExplanation -solutionApproach -evaluationRubric -hiddenRequirements -internalReferences -hiddenTests -files').sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
  res.json({ success: true, data: rows.map(serializeDashboardCodebase), pagination: { page, limit } });
}));

router.post('/codebases', wrap(async (req, res) => {
  let input;
  try { input = validateCodebaseInput(req.body); if (input.files?.length) validateProjectFiles(input.files); }
  catch (error) { return fail(res, 422, 'VALIDATION_ERROR', error.message); }
  const doc = await createDraft(req.user.id, input);
  res.status(201).json({ success: true, data: await serializeCreatorCodebase(doc) });
}));

router.get('/codebases/:id', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  await hydrateFiles(doc);
  res.json({ success: true, data: await serializeCreatorCodebase(doc) });
}));

router.patch('/codebases/:id', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  let input;
  try { input = validateCodebaseInput(req.body, { partial: true }); if (input.files) validateProjectFiles(input.files); }
  catch (error) { return fail(res, 422, 'VALIDATION_ERROR', error.message); }
  const result = await updateDraft(doc, input, req.body.version);
  await hydrateFiles(result);
  res.json({ success: true, data: await serializeCreatorCodebase(result) });
}));

router.post('/codebases/:id/versions', wrap(async (req, res) => {
  const source = await editable(req, res); if (!source) return;
  if (source.state !== 'PUBLISHED') return fail(res, 409, 'INVALID_STATE', 'Only a published codebase can be forked into a new draft version.');
  const draft = await forkPublishedVersion(source);
  await hydrateFiles(draft);
  res.status(201).json({ success: true, data: await serializeCreatorCodebase(draft) });
}));

router.get('/codebases/:id/versions', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  const rows = await CodebaseVersion.find({ seriesId: doc.seriesId || doc._id, creatorId: req.user.id }).select('version codebaseId creatorId createdAt').sort({ version: -1 }).lean();
  res.json({ success: true, data: rows });
}));

router.get('/codebases/:id/preview', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  const candidatePreview = await serializePublicCodebase(doc);
  res.json({ success: true, data: candidatePreview });
}));

router.post('/codebases/:id/publish', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  const published = await publishDraft(doc);
  res.json({ success: true, data: await serializePublicCodebase(published) });
}));

router.post('/codebases/:id/archive', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  if (doc.state !== 'PUBLISHED') return fail(res, 409, 'INVALID_STATE', 'Only published codebases can be archived.');
  doc.state = 'ARCHIVED'; await doc.save();
  res.json({ success: true, data: { id: doc.id, state: doc.state } });
}));

router.post('/codebases/:id/restore', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  await restoreArchived(doc);
  res.json({ success: true, data: await serializeDashboardCodebase(doc) });
}));

router.delete('/codebases/:id', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  await deleteDraft(doc);
  res.status(204).end();
}));

router.get('/codebases/:id/files', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  const tree = fileTree(doc.files, doc.directories);
  const search = typeof req.query.q === 'string' ? req.query.q.toLowerCase().slice(0, 100) : '';
  res.json({ success: true, data: search ? { ...tree, files: tree.files.filter(file => file.path.toLowerCase().includes(search)) } : tree });
}));

router.get('/codebases/:id/file', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  let requested;
  try { requested = normalizeProjectPath(req.query.path); }
  catch (error) { return fail(res, 422, 'INVALID_PATH', error.message); }
  const descriptor = doc.files.find(file => file.path === requested);
  if (!descriptor) return fail(res, 404, 'FILE_NOT_FOUND', 'Project file was not found.');
  const [file] = await readProjectFiles([descriptor]);
  res.json({ success: true, data: file });
}));

router.patch('/codebases/:id/file-content', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  if (doc.state !== 'DRAFT') return fail(res, 409, 'PUBLISHED_IMMUTABLE', 'Start a new draft version before changing files.');
  let file;
  try { file = validateProjectFiles([{ path: req.body.path, content: req.body.content }])[0]; }
  catch (error) { return fail(res, 422, 'INVALID_FILE', error.message); }
  await updateStoredProjectFile(doc, file, req.body.version);
  res.json({ success: true, data: { version: doc.version, path: file.path, size: file.size } });
}));

router.put('/codebases/:id/files', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  if (doc.state !== 'DRAFT') return fail(res, 409, 'PUBLISHED_IMMUTABLE', 'Start a new draft version before changing files.');
  let files;
  try { files = validateProjectFiles(req.body.files); }
  catch (error) { return fail(res, 422, 'INVALID_FILES', error.message); }
  await saveFiles(doc, files);
  res.json({ success: true, data: { ...fileTree(doc.files, doc.directories), version: doc.version } });
}));

router.post('/codebases/:id/files', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  if (doc.state !== 'DRAFT') return fail(res, 409, 'PUBLISHED_IMMUTABLE', 'Start a new draft version before changing files.');
  let file;
  try { file = validateProjectFiles([req.body.file])[0]; }
  catch (error) { return fail(res, 422, 'INVALID_FILE', error.message); }
  if (doc.files.some(item => item.path.toLowerCase() === file.path.toLowerCase())) return fail(res, 409, 'FILE_EXISTS', 'A file already exists at this path.');
  await saveFiles(doc, [...await readProjectFiles(doc.files), file]);
  res.status(201).json({ success: true, data: { ...fileTree(doc.files, doc.directories), version: doc.version } });
}));

router.patch('/codebases/:id/files/rename', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  if (doc.state !== 'DRAFT') return fail(res, 409, 'PUBLISHED_IMMUTABLE', 'Start a new draft version before changing files.');
  try {
    const oldPath = normalizeProjectPath(req.body.oldPath), newPath = normalizeProjectPath(req.body.newPath);
    if (!doc.files.some(file => file.path === oldPath)) return fail(res, 404, 'FILE_NOT_FOUND', 'Project file was not found.');
    if (doc.files.some(file => file.path.toLowerCase() === newPath.toLowerCase())) return fail(res, 409, 'FILE_EXISTS', 'A file already exists at the new path.');
    const files = await readProjectFiles(doc.files);
    await saveFiles(doc, files.map(file => file.path === oldPath ? { ...file, path: newPath } : file));
    res.json({ success: true, data: { ...fileTree(doc.files, doc.directories), version: doc.version } });
  } catch (error) { return fail(res, 422, 'INVALID_PATH', error.message); }
}));

router.delete('/codebases/:id/files', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  if (doc.state !== 'DRAFT') return fail(res, 409, 'PUBLISHED_IMMUTABLE', 'Start a new draft version before changing files.');
  let filePath;
  try { filePath = normalizeProjectPath(req.query.path); }
  catch (error) { return fail(res, 422, 'INVALID_PATH', error.message); }
  if (!doc.files.some(file => file.path === filePath)) return fail(res, 404, 'FILE_NOT_FOUND', 'Project file was not found.');
  await saveFiles(doc, (await readProjectFiles(doc.files)).filter(file => file.path !== filePath));
  res.status(204).end();
}));

router.post('/codebases/:id/upload', upload.single('archive'), wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  if (doc.state !== 'DRAFT') return fail(res, 409, 'PUBLISHED_IMMUTABLE', 'Start a new draft version before uploading files.');
  if (!req.file) return fail(res, 400, 'ARCHIVE_REQUIRED', 'Upload one ZIP archive using the archive field.');
  if (!req.file.originalname.toLowerCase().endsWith('.zip') || req.file.mimetype !== 'application/zip' && req.file.mimetype !== 'application/x-zip-compressed' && req.file.mimetype !== 'application/octet-stream') return fail(res, 415, 'UNSUPPORTED_ARCHIVE', 'Upload a ZIP archive.');
  try {
    const extracted = await extractSafeZip(req.file.buffer);
    const existingPaths = new Set(doc.files.map(file => file.path.toLowerCase()));
    const duplicate = extracted.find(file => existingPaths.has(file.path.toLowerCase()));
    if (duplicate) return fail(res, 409, 'FILE_EXISTS', `Archive file already exists in this codebase: ${duplicate.path}`);
    doc.sourceMetadata = { provider: 'zip', importedAt: new Date() };
    await saveFiles(doc, [...await readProjectFiles(doc.files), ...extracted]);
    res.status(201).json({ success: true, data: { ...fileTree(doc.files, doc.directories), version: doc.version }, message: `Imported ${extracted.length} text files.` });
  } catch (error) { return fail(res, 422, 'ARCHIVE_REJECTED', error.message); }
}));

router.post('/codebases/:id/directories', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  if (doc.state !== 'DRAFT') return fail(res, 409, 'PUBLISHED_IMMUTABLE', 'Start a new draft version before changing directories.');
  let directory;
  try { directory = normalizeProjectPath(req.body.path, { directory: true }); }
  catch (error) { return fail(res, 422, 'INVALID_PATH', error.message); }
  if (doc.directories.includes(directory) || doc.files.some(file => file.path === directory)) return fail(res, 409, 'PATH_EXISTS', 'A file or directory already exists at this path.');
  doc.directories.push(directory); doc.version += 1; await doc.save();
  res.status(201).json({ success: true, data: { ...fileTree(doc.files, doc.directories), version: doc.version } });
}));

router.delete('/codebases/:id/directories', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  if (doc.state !== 'DRAFT') return fail(res, 409, 'PUBLISHED_IMMUTABLE', 'Start a new draft version before changing directories.');
  let directory;
  try { directory = normalizeProjectPath(req.query.path, { directory: true }); }
  catch (error) { return fail(res, 422, 'INVALID_PATH', error.message); }
  if (!doc.directories.includes(directory)) return fail(res, 404, 'DIRECTORY_NOT_FOUND', 'Project directory was not found.');
  if (doc.files.some(file => file.path.startsWith(`${directory}/`))) return fail(res, 409, 'DIRECTORY_NOT_EMPTY', 'Move or delete its files before removing this directory.');
  doc.directories.pull(directory); doc.version += 1; await doc.save(); res.status(204).end();
}));

router.post('/codebases/:id/import-github', wrap(async (req, res) => {
  const doc = await editable(req, res); if (!doc) return;
  if (doc.state !== 'DRAFT') return fail(res, 409, 'PUBLISHED_IMMUTABLE', 'Start a new draft version before importing source.');
  let repository;
  try { repository = parsePublicGitHubUrl(req.body.url); }
  catch (error) { return fail(res, 422, 'INVALID_REPOSITORY_URL', error.message); }
  try { const result = await importPublicGitHubRepository(repository); res.json({ success: true, data: result }); }
  catch (error) { if (error.code === 'IMPORT_DISABLED') return fail(res, 501, error.code, error.message); throw error; }
}));

export default router;
