import mongoose from 'mongoose';
import Codebase from '../../../models/Codebase.js';
import CodebaseVersion from '../../../models/CodebaseVersion.js';
import { persistProjectFiles, readProjectFiles, removeProjectFiles } from './projectFiles.js';

const privateSelect = '+privateNotes +intendedBugExplanation +solutionApproach +evaluationRubric +hiddenRequirements +internalReferences +hiddenTests +files.content +files.storageKey';
const snapshot = doc => {
  const value = doc.toObject({ getters: false, virtuals: false });
  delete value._id; delete value.__v; delete value.createdAt; delete value.updatedAt;
  return value;
};

export async function getOwnedCodebase(id, ownerId) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Codebase.findOne({ _id: id, ownerId }).select(privateSelect);
}

export async function hydrateFiles(doc) {
  doc.files = await readProjectFiles(doc.files || []);
  return doc;
}

export async function replaceFiles(doc, incomingFiles) {
  const oldFiles = doc.files || [];
  const nextFiles = incomingFiles.length ? await persistProjectFiles(incomingFiles) : [];
  doc.files = nextFiles;
  doc.version += 1;
  try { await doc.save(); }
  catch (error) { await removeProjectFiles(nextFiles); throw error; }
  await removeProjectFiles(oldFiles);
  return doc;
}

export async function createDraft(ownerId, input) {
  const files = input.files || [];
  const doc = new Codebase({ ...input, files: [], ownerId, state: 'DRAFT', version: input.version || 1, sourceMetadata: input.sourceMetadata || { provider: 'manual' } });
  await doc.save();
  if (files.length) {
    try { await replaceFiles(doc, files); }
    catch (error) { await Codebase.deleteOne({ _id: doc._id, ownerId, state: 'DRAFT' }); throw error; }
  }
  return doc;
}

export async function updateDraft(doc, input, expectedVersion) {
  if (doc.state !== 'DRAFT') { const error = new Error('Published and archived codebases cannot be edited in place. Start a new draft version.'); error.code = 'INVALID_STATE'; throw error; }
  if (expectedVersion !== undefined && Number(expectedVersion) !== doc.version) { const error = new Error('This codebase changed since you opened it. Reload and retry.'); error.code = 'VERSION_CONFLICT'; throw error; }
  const { files, ...fields } = input;
  doc.set(fields);
  doc.version += 1;
  if (files !== undefined) {
    const oldFiles = doc.files || [];
    const nextFiles = files.length ? await persistProjectFiles(files) : [];
    doc.files = nextFiles;
    try { await doc.save(); }
    catch (error) { await removeProjectFiles(nextFiles); throw error; }
    await removeProjectFiles(oldFiles);
    return doc;
  }
  await doc.save();
  return doc;
}

export async function forkPublishedVersion(source) {
  const seriesId = source.seriesId || source._id;
  const latest = await Codebase.findOne({ seriesId, ownerId: source.ownerId }).sort({ version: -1 }).select('version');
  const data = source.toObject({ getters: false, virtuals: false });
  const files = await readProjectFiles(source.files);
  delete data._id; delete data.__v; delete data.createdAt; delete data.updatedAt;
  return createDraft(source.ownerId, { ...data, files, seriesId, version: (latest?.version || source.version || 1) + 1, state: 'DRAFT' });
}

export async function publishDraft(doc) {
  if (doc.state !== 'DRAFT') { const error = new Error('Only a draft can be published.'); error.code = 'INVALID_STATE'; throw error; }
  const errors = [];
  for (const [field, label] of [['title','Project title'],['description','Short description'],['detailedDescription','Detailed description'],['problemStatement','Candidate challenge description'],['bugTitle','Bug title'],['bugDescription','Bug description'],['expectedBehavior','Expected behavior'],['actualBehavior','Actual behavior'],['instructions','Setup instructions']]) if (!String(doc[field] || '').trim()) errors.push(label);
  if (!doc.files?.length) errors.push('At least one source file');
  if (!doc.acceptanceCriteria?.length) errors.push('At least one acceptance criterion');
  if (errors.length) { const error = new Error(`Complete required fields before publishing: ${errors.join(', ')}.`); error.code = 'PUBLISH_VALIDATION'; error.fields = errors; throw error; }
  const seriesId = doc.seriesId || doc._id;
  const latest = await CodebaseVersion.findOne({ seriesId }).sort({ version: -1 }).select('version');
  doc.seriesId = seriesId;
  doc.version = Math.max(doc.version || 1, (latest?.version || 0) + 1);
  doc.state = 'PUBLISHED';
  doc.publishedAt = new Date();
  const version = await CodebaseVersion.create({ seriesId, codebaseId: doc._id, version: doc.version, creatorId: doc.ownerId, snapshot: snapshot(doc) });
  try { await doc.save(); }
  catch (error) { await CodebaseVersion.deleteOne({ _id: version._id }); throw error; }
  try { await Codebase.updateMany({ seriesId, _id: { $ne: doc._id }, state: 'PUBLISHED' }, { $set: { state: 'ARCHIVED' } }); }
  catch (error) {
    doc.state = 'DRAFT'; await doc.save();
    await CodebaseVersion.deleteOne({ _id: version._id });
    throw error;
  }
  return doc;
}

export async function restoreArchived(doc) {
  if (doc.state !== 'ARCHIVED') { const error = new Error('Only an archived codebase can be restored.'); error.code = 'INVALID_STATE'; throw error; }
  const seriesId = doc.seriesId || doc._id;
  await Codebase.updateMany({ seriesId, _id: { $ne: doc._id }, state: 'PUBLISHED' }, { $set: { state: 'ARCHIVED' } });
  doc.state = 'PUBLISHED';
  await doc.save();
  return doc;
}

export async function deleteDraft(doc) {
  if (doc.state !== 'DRAFT') { const error = new Error('Only drafts can be permanently deleted.'); error.code = 'INVALID_STATE'; throw error; }
  const result = await Codebase.deleteOne({ _id: doc._id, ownerId: doc.ownerId, state: 'DRAFT' });
  if (result.deletedCount !== 1) { const error = new Error('Draft changed before deletion. Reload and retry.'); error.code = 'VERSION_CONFLICT'; throw error; }
  await removeProjectFiles(doc.files);
}
