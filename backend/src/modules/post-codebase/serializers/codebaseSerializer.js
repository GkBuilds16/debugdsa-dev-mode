import { readProjectFiles } from '../services/projectFiles.js';

const PRIVATE_FIELDS = ['ownerId', '__v', 'seriesId', 'sourceMetadata', 'privateNotes', 'intendedBugExplanation', 'solutionApproach', 'evaluationRubric', 'hiddenRequirements', 'internalReferences', 'hiddenTests'];
const plain = value => value?.toObject ? value.toObject({ getters: false, virtuals: false }) : structuredClone(value);

export async function serializePublicCodebase(value, { includeFileContents = true } = {}) {
  const doc = plain(value);
  for (const field of PRIVATE_FIELDS) delete doc[field];
  if (includeFileContents) {
    doc.files = await readProjectFiles(doc.files || []);
    doc.files = doc.files.map(({ path, content }) => ({ path, content }));
  } else {
    doc.files = (doc.files || []).map(({ path, size, contentType }) => ({ path, size, contentType }));
  }
  return doc;
}

export async function serializeCreatorCodebase(value) {
  const doc = plain(value);
  doc.files = await readProjectFiles(doc.files || []);
  doc.files = doc.files.map(({ path, content }) => ({ path, content }));
  return doc;
}

export const serializeDashboardCodebase = value => {
  const doc = plain(value);
  for (const field of [...PRIVATE_FIELDS, 'files', 'directories']) delete doc[field];
  return doc;
};
