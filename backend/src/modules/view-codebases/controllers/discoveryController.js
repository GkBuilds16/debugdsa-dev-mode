import mongoose from 'mongoose';
import Codebase from '../../../models/Codebase.js';
import { fileTree, readProjectFiles } from '../../post-codebase/services/projectFiles.js';
import { localFileStorage } from '../../post-codebase/services/localFileStorage.js';
import { serializePublicCodebase } from '../../post-codebase/serializers/codebaseSerializer.js';
import { validateCandidatePath } from '../validators/candidateInput.js';
import { serializeCandidateSummary } from '../serializers/candidateSerializer.js';

const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });
const idOk = id => mongoose.isValidObjectId(id);

export async function listPublishedCodebases(req, res) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 12));
  const filter = { state: 'PUBLISHED' };
  if (['Easy', 'Medium', 'Hard'].includes(req.query.difficulty)) filter.difficulty = req.query.difficulty;
  for (const field of ['language', 'framework', 'tag']) if (typeof req.query[field] === 'string' && req.query[field].trim().length <= 40) filter[field === 'language' ? 'languages' : field === 'framework' ? 'frameworks' : 'tags'] = req.query[field].trim();
  if (typeof req.query.q === 'string' && req.query.q.trim()) filter.$text = { $search: req.query.q.trim().slice(0, 100) };
  const sorters = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, difficulty: { difficulty: 1, createdAt: -1 }, time: { estimatedMinutes: 1, createdAt: -1 } };
  const sort = sorters[req.query.sort] || sorters.newest;
  const [rows, total] = await Promise.all([
    Codebase.find(filter).select('-ownerId -files -directories -privateNotes -intendedBugExplanation -solutionApproach -evaluationRubric -hiddenRequirements -internalReferences -hiddenTests').sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    Codebase.countDocuments(filter)
  ]);
  res.json({ success: true, data: rows.map(row => serializeCandidateSummary(row)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

export async function getPublishedCodebase(req, res) {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const codebase = await Codebase.findOneAndUpdate({ _id: req.params.id, state: 'PUBLISHED' }, { $inc: { viewCount: 1 } }, { new: true }).select('-privateNotes -intendedBugExplanation -solutionApproach -evaluationRubric -hiddenRequirements -internalReferences -hiddenTests -ownerId +files.storageKey +files.size +files.contentType');
  if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  res.json({ success: true, data: await serializePublicCodebase(codebase, { includeFileContents: false }) });
}

export async function getPublishedFileTree(req, res) {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  const codebase = await Codebase.findOne({ _id: req.params.id, state: 'PUBLISHED' }).select('files.path files.size files.contentType directories');
  if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const tree = fileTree(codebase.files, codebase.directories);
  const query = typeof req.query.q === 'string' ? req.query.q.toLowerCase().slice(0, 100) : '';
  res.json({ success: true, data: query ? { ...tree, files: tree.files.filter(file => file.path.toLowerCase().includes(query)) } : tree });
}

export async function getPublishedFile(req, res) {
  if (!idOk(req.params.id)) return fail(res, 400, 'INVALID_ID', 'Codebase ID is invalid.');
  let filePath; try { filePath = validateCandidatePath(req.query.path); } catch (error) { return fail(res, 422, 'INVALID_PATH', error.message); }
  const codebase = await Codebase.findOne({ _id: req.params.id, state: 'PUBLISHED' }).select('files.path files.size files.storageKey +files.content');
  if (!codebase) return fail(res, 404, 'NOT_FOUND', 'Published codebase was not found.');
  const descriptor = codebase.files.find(file => file.path === filePath);
  if (!descriptor) return fail(res, 404, 'FILE_NOT_FOUND', 'Project file was not found.');
  try { const content = descriptor.storageKey ? (await localFileStorage.get(descriptor.storageKey)).toString('utf8') : (await readProjectFiles([descriptor]))[0].content; res.json({ success: true, data: { path: descriptor.path, size: Buffer.byteLength(content, 'utf8'), content } }); }
  catch { return fail(res, 404, 'FILE_UNAVAILABLE', 'Project file is currently unavailable.'); }
}
