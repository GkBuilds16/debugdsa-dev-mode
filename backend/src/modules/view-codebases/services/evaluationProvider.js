// Provider contract for future isolated evaluation. No code is executed here.
export class EvaluationProvider {
  async evaluate(_submission) {
    throw new Error('EvaluationProvider.evaluate must be implemented by a verified isolated provider.');
  }
}

export const evaluationProvider = Object.freeze({
  available: false,
  async evaluate() { return { status: 'NOT_EVALUATED', feedback: null }; }
});
