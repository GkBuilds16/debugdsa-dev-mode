const text = (value, max) => typeof value === 'string' && value.trim().length <= max;

export function validateBattleInput(input, { partial = false } = {}) {
  const errors = [];
  if (!partial || input.title !== undefined) if (!text(input.title, 100) || !input.title.trim()) errors.push('Title is required (up to 100 characters).');
  if (!partial || input.description !== undefined) if (!text(input.description || '', 2000)) errors.push('Description must be at most 2000 characters.');
  if (!partial || input.instructions !== undefined) if (!text(input.instructions || '', 10000)) errors.push('Instructions must be at most 10000 characters.');
  if (!partial || input.rules !== undefined) if (!text(input.rules || '', 5000)) errors.push('Rules must be at most 5000 characters.');
  if (!partial || input.startsAt !== undefined) { const date = new Date(input.startsAt); if (!input.startsAt || !Number.isFinite(+date)) errors.push('A valid start time is required.'); }
  if (!partial || input.registrationDeadline !== undefined) { const date = new Date(input.registrationDeadline); if (!input.registrationDeadline || !Number.isFinite(+date)) errors.push('A valid registration deadline is required.'); }
  if (!partial || input.durationMinutes !== undefined) if (!Number.isInteger(Number(input.durationMinutes)) || Number(input.durationMinutes) < 5 || Number(input.durationMinutes) > 360) errors.push('Duration must be between 5 and 360 minutes.');
  if (!partial || input.capacity !== undefined) if (!Number.isInteger(Number(input.capacity)) || Number(input.capacity) < 2 || Number(input.capacity) > 10000) errors.push('Capacity must be between 2 and 10000.');
  if (input.allowedLanguages !== undefined && (!Array.isArray(input.allowedLanguages) || input.allowedLanguages.length > 30 || input.allowedLanguages.some(item => !text(item, 40)))) errors.push('Allowed languages must be a list of at most 30 short names.');
  if (input.eligibleUserIds !== undefined && (!Array.isArray(input.eligibleUserIds) || input.eligibleUserIds.length > 500 || input.eligibleUserIds.some(item => typeof item !== 'string' || item.length > 200))) errors.push('Eligibility list is invalid.');
  if (!partial || input.codebaseId !== undefined) if (typeof input.codebaseId !== 'string') errors.push('A published codebase is required.');
  if (!partial || input.codebaseVersion !== undefined) if (!Number.isInteger(Number(input.codebaseVersion)) || Number(input.codebaseVersion) < 1) errors.push('A published codebase version is required.');
  if (errors.length) { const error = new Error(errors.join(' ')); error.code = 'BATTLE_VALIDATION'; error.details = errors; throw error; }
  if (input.startsAt !== undefined && input.registrationDeadline !== undefined && new Date(input.registrationDeadline) >= new Date(input.startsAt)) throw Object.assign(new Error('Registration deadline must precede battle start.'), { code: 'BATTLE_VALIDATION' });
  return {
    ...(input.title !== undefined && { title: input.title.trim() }),
    ...(input.description !== undefined && { description: input.description.trim() }),
    ...(input.instructions !== undefined && { instructions: input.instructions.trim() }),
    ...(input.rules !== undefined && { rules: input.rules.trim() }),
    ...(input.startsAt !== undefined && { startsAt: new Date(input.startsAt) }),
    ...(input.registrationDeadline !== undefined && { registrationDeadline: new Date(input.registrationDeadline) }),
    ...(input.durationMinutes !== undefined && { durationMinutes: Number(input.durationMinutes) }),
    ...(input.capacity !== undefined && { capacity: Number(input.capacity) }),
    ...(input.allowedLanguages !== undefined && { allowedLanguages: input.allowedLanguages.map(item => item.trim()) }),
    ...(input.eligibleUserIds !== undefined && { eligibleUserIds: [...new Set(input.eligibleUserIds)] }),
    ...(input.codebaseId !== undefined && { codebaseId: input.codebaseId }),
    ...(input.codebaseVersion !== undefined && { codebaseVersion: Number(input.codebaseVersion) })
  };
}
