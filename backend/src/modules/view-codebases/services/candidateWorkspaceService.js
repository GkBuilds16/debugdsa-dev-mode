import Attempt from '../../../models/Attempt.js';
import Codebase from '../../../models/Codebase.js';
import Submission from '../../../models/Submission.js';
import CodebaseVersion from '../../../models/CodebaseVersion.js';
import { localFileStorage } from '../../post-codebase/services/localFileStorage.js';
import { readProjectFiles } from '../../post-codebase/services/projectFiles.js';
import { MAX_TOTAL_BYTES } from '../../post-codebase/services/filePolicy.js';
import { evaluationProvider } from './evaluationProvider.js';

export async function readReferencedFiles(references = []) {
  return Promise.all(references.map(async file => ({ path: file.path, size: file.size, content: (await localFileStorage.get(file.storageKey)).toString('utf8') })));
}

export async function createOrGetWorkspace(codebase, userId) {
  const publishedVersion = codebase.version || 1;
  const publishedVersionDoc = await CodebaseVersion.findOne({ codebaseId: codebase._id, version: publishedVersion }).select('_id');
  let attempt = await Attempt.findOne({ codebaseId: codebase._id, publishedVersion, userId, status: 'IN_PROGRESS' }).select('+workspaceFiles.storageKey');
  if (attempt) return attempt;
  try {
    const attempt = await Attempt.create({ codebaseId: codebase._id, publishedVersion, publishedVersionId: publishedVersionDoc?._id || null, userId, workspaceFiles: [], revision: 0 });
    await Codebase.updateOne({ _id: codebase._id }, { $inc: { attemptCount: 1 } });
    return attempt;
  }
  catch (error) {
    if (error.code !== 11000) throw error;
    attempt = await Attempt.findOne({ codebaseId: codebase._id, publishedVersion, userId, status: 'IN_PROGRESS' }).select('+workspaceFiles.storageKey');
    if (!attempt) throw error;
    return attempt;
  }
}

export async function materializeWorkspace(codebase, attempt) {
  const originals = await readProjectFiles(codebase.files || []);
  for (const file of originals) file.size = Buffer.byteLength(file.content, 'utf8');
  const overrides = await readReferencedFiles(attempt.workspaceFiles || []);
  const changed = new Map(overrides.map(file => [file.path, file]));
  return originals.map(file => changed.get(file.path) || file);
}

export async function saveWorkspace(attempt, changes, expectedRevision, resetPaths = [], baseFiles = []) {
  if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) !== attempt.revision) {
    const error = new Error('Workspace changed in another session. Reload the latest saved version before continuing.'); error.code = 'WORKSPACE_CONFLICT'; throw error;
  }
  if (attempt.status !== 'IN_PROGRESS') { const error = new Error('This workspace has been submitted. Start another attempt to continue.'); error.code = 'WORKSPACE_SUBMITTED'; throw error; }
  const oldByPath = new Map((attempt.workspaceFiles || []).map(file => [file.path, { path: file.path, size: file.size, storageKey: file.storageKey }]));
  const nextRefs = []; const addedKeys = [];
  try {
    for (const resetPath of resetPaths) oldByPath.delete(resetPath);
    for (const file of changes) {
      const old = oldByPath.get(file.path);
      if (old && old.size === file.size && (await localFileStorage.get(old.storageKey)).toString('utf8') === file.content) { nextRefs.push({ path: file.path, size: old.size, storageKey: old.storageKey }); oldByPath.delete(file.path); continue; }
      const storageKey = await localFileStorage.put(Buffer.from(file.content, 'utf8'));
      addedKeys.push(storageKey); nextRefs.push({ path: file.path, size: file.size, storageKey }); oldByPath.delete(file.path);
    }
    nextRefs.push(...oldByPath.values());
    const effectiveSizes = new Map(baseFiles.map(file => [file.path, file.size || 0]));
    for (const file of nextRefs) effectiveSizes.set(file.path, file.size);
    if (effectiveSizes.size > 300 || [...effectiveSizes.values()].reduce((sum, size) => sum + size, 0) > MAX_TOTAL_BYTES) { const error = new Error('Candidate workspace exceeds the 8 MiB or 300 file limit.'); error.code = 'WORKSPACE_TOO_LARGE'; throw error; }
    const result = await Attempt.findOneAndUpdate({ _id: attempt._id, userId: attempt.userId, status: 'IN_PROGRESS', revision: attempt.revision }, { $set: { workspaceFiles: nextRefs }, $inc: { revision: 1 } }, { new: true, runValidators: true }).select('+workspaceFiles.storageKey');
    if (!result) { const error = new Error('Workspace changed in another session. Reload the latest saved version before continuing.'); error.code = 'WORKSPACE_CONFLICT'; throw error; }
    const activeKeys = new Set(nextRefs.map(file => file.storageKey));
    await Promise.all((attempt.workspaceFiles || []).filter(file => !activeKeys.has(file.storageKey)).map(file => localFileStorage.remove(file.storageKey)));
    return result;
  } catch (error) { await Promise.all(addedKeys.map(key => localFileStorage.remove(key))); throw error; }
}

export async function createSubmission(codebase, attempt, expectedRevision) {
  if (!Number.isInteger(Number(expectedRevision)) || Number(expectedRevision) !== attempt.revision) { const error = new Error('Workspace changed before submission. Reload and review your latest saved work.'); error.code = 'WORKSPACE_CONFLICT'; throw error; }
  if (attempt.status !== 'IN_PROGRESS') { const error = new Error('This workspace has already been submitted.'); error.code = 'WORKSPACE_SUBMITTED'; throw error; }
  const files = await materializeWorkspace(codebase, attempt);
  const snapshotRefs = [];
  try {
    for (const file of files) snapshotRefs.push({ path: file.path, size: Buffer.byteLength(file.content, 'utf8'), storageKey: await localFileStorage.put(Buffer.from(file.content, 'utf8')) });
    const evaluation = await evaluationProvider.evaluate({ codebaseId: String(codebase._id), publishedVersion: attempt.publishedVersion });
    const submission = await Submission.create({ attemptId: attempt._id, codebaseId: codebase._id, publishedVersion: attempt.publishedVersion, publishedVersionId: attempt.publishedVersionId || null, userId: attempt.userId, submittedFiles: snapshotRefs, fileCount: snapshotRefs.length, evaluationStatus: evaluation.status, result: evaluation.feedback || null });
    const updated = await Attempt.findOneAndUpdate({ _id: attempt._id, userId: attempt.userId, status: 'IN_PROGRESS', revision: attempt.revision }, { $set: { status: 'SUBMITTED', lastSubmissionAt: new Date() }, $inc: { revision: 1 } }, { new: true });
    if (!updated) { await Submission.deleteOne({ _id: submission._id, userId: attempt.userId }); const error = new Error('Workspace changed before submission. Reload and try again.'); error.code = 'WORKSPACE_CONFLICT'; throw error; }
    return submission;
  } catch (error) {
    await Promise.all(snapshotRefs.map(file => localFileStorage.remove(file.storageKey)));
    throw error;
  }
}

export async function readSubmission(submission) { return readReferencedFiles(submission.submittedFiles || []); }

export async function findPublishedCodebase(id) { return Codebase.findOne({ _id: id, state: 'PUBLISHED' }).select('+files.storageKey +files.content'); }
