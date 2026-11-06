export const EvaluationStatus = Object.freeze(['NOT_EVALUATED', 'PENDING', 'EVALUATED', 'FAILED']);

export function createEvaluationRequest({ battleId, workspaceId, submissionId, codebaseVersionId }) {
  if (!battleId || !workspaceId || !submissionId || !codebaseVersionId) throw new TypeError('Evaluation requests require battle, workspace, submission, and immutable challenge version identifiers.');
  return Object.freeze({ battleId: String(battleId), workspaceId: String(workspaceId), submissionId: String(submissionId), codebaseVersionId: String(codebaseVersionId) });
}

export class EvaluationProviderError extends Error {
  constructor(message, { retryable = false, cause } = {}) { super(message, { cause }); this.name = 'EvaluationProviderError'; this.retryable = retryable; }
}

/** Provider contract: return an explicit status and verified result fields; never execute in this process. */
export const evaluationProvider = Object.freeze({
  available: false,
  async evaluate() { return { status: 'NOT_EVALUATED', result: null }; }
});
