const challengeFields = ['title', 'description', 'detailedDescription', 'problemStatement', 'category', 'difficulty', 'languages', 'technologies', 'frameworks', 'estimatedMinutes', 'readme', 'instructions', 'prerequisites', 'environmentDocumentation', 'configurationInstructions', 'expectedStructure', 'bugTitle', 'bugDescription', 'currentBehavior', 'expectedBehavior', 'actualBehavior', 'reproductionSteps', 'relevantFiles', 'relevantSymbols', 'errorLogs', 'acceptanceCriteria', 'expectedDeliverables', 'publicHints', 'runtimeVersions', 'databaseTechnology', 'requiredTools', 'dependencies', 'commands', 'tags'];
const privateFields = new Set(['ownerId', 'seriesId', 'sourceMetadata', 'privateNotes', 'intendedBugExplanation', 'solutionApproach', 'evaluationRubric', 'hiddenRequirements', 'internalReferences', 'hiddenTests', 'directories', 'storageKey']);

export function publicChallenge(snapshot, files = false) {
  const result = {};
  for (const key of challengeFields) if (snapshot?.[key] !== undefined) result[key] = snapshot[key];
  result.files = files ? (snapshot?.files || []).map(({ path, size, contentType, content }) => ({ path, size, contentType, content })) : (snapshot?.files || []).map(({ path, size, contentType }) => ({ path, size, contentType }));
  for (const key of privateFields) delete result[key];
  return result;
}

export function serializeBattle(battle, { organizer = false, state = battle.status } = {}) {
  const data = battle?.toObject ? battle.toObject({ getters: false, virtuals: false }) : { ...battle };
  if (!organizer) delete data.eligibleUserIds;
  delete data.ownerId; delete data.__v;
  return { ...data, id: String(battle._id), status: state, endsAt: new Date(+new Date(battle.startsAt) + battle.durationMinutes * 60_000), serverTime: new Date(), evaluation: 'DISABLED', ...(organizer ? { ownerView: true } : {}) };
}

export const serializeRegistration = row => ({ id: String(row._id), battleId: String(row.battleId), status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt });
export const serializeWorkspace = (row, files) => ({ id: String(row._id), battleId: String(row.battleId), revision: row.revision, status: row.status, files, updatedAt: row.updatedAt });
export const serializeSubmission = row => ({ id: String(row._id), battleId: String(row.battleId), evaluationStatus: row.evaluationStatus || 'NOT_EVALUATED', submittedAt: row.createdAt, fileCount: row.fileCount, result: row.evaluationStatus === 'EVALUATED' ? row.result : null });
