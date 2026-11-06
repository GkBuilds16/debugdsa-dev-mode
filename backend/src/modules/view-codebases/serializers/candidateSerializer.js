const PRIVATE = ['ownerId', '__v', 'seriesId', 'sourceMetadata', 'privateNotes', 'intendedBugExplanation', 'solutionApproach', 'evaluationRubric', 'hiddenRequirements', 'internalReferences', 'hiddenTests'];

export function serializeCandidateSummary(value, { progress = 'NOT_STARTED', bookmarked = false } = {}) {
  const doc = value?.toObject ? value.toObject({ getters: false, virtuals: false }) : { ...value };
  for (const key of PRIVATE) delete doc[key];
  delete doc.files;
  delete doc.directories;
  doc.progress = progress;
  doc.bookmarked = bookmarked;
  return doc;
}

export function serializeWorkspace(attempt, files) {
  return { id: String(attempt._id), codebaseId: String(attempt.codebaseId), publishedVersionId: attempt.publishedVersionId ? String(attempt.publishedVersionId) : null, publishedVersion: attempt.publishedVersion, status: attempt.status, revision: attempt.revision, createdAt: attempt.createdAt, updatedAt: attempt.updatedAt, files };
}

export const serializeAttemptSummary = value => ({ id: String(value._id), codebaseId: String(value.codebaseId), publishedVersionId: value.publishedVersionId ? String(value.publishedVersionId) : null, publishedVersion: value.publishedVersion, status: value.status, revision: value.revision, lastSubmissionAt: value.lastSubmissionAt, createdAt: value.createdAt, updatedAt: value.updatedAt });

export const serializeSubmissionSummary = value => ({ id: String(value._id), attemptId: String(value.attemptId), codebaseId: String(value.codebaseId), publishedVersionId: value.publishedVersionId ? String(value.publishedVersionId) : null, publishedVersion: value.publishedVersion, evaluationStatus: value.evaluationStatus || 'NOT_EVALUATED', createdAt: value.createdAt, fileCount: value.fileCount || value.submittedFiles?.length || 0 });
