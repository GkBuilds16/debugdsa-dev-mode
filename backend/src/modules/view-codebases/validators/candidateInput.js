import { normalizeProjectPath, MAX_TOTAL_BYTES, MAX_FILES, validateProjectFiles } from '../../post-codebase/services/filePolicy.js';

export function validateWorkspaceFiles(input, allowedPaths) {
  if (!Array.isArray(input) || input.length > MAX_FILES) throw new Error('Workspace files must be a list of at most 300 files.');
  const validated = input.length ? validateProjectFiles(input) : [];
  const allowed = new Set(allowedPaths);
  if (validated.some(file => !allowed.has(file.path))) throw new Error('Workspace can only edit files in this published codebase.');
  if (validated.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) throw new Error('Workspace exceeds the 8 MiB total limit.');
  return validated.map(({ path, content, size }) => ({ path, content, size }));
}

export function validateCandidatePath(value) { return normalizeProjectPath(value); }
