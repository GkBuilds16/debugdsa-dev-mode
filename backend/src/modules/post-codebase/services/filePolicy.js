import path from 'node:path';

export const MAX_FILES = 300;
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 600;
const allowedExtensions = new Set(['.md','.txt','.json','.js','.jsx','.ts','.tsx','.py','.java','.c','.cpp','.h','.hpp','.cs','.go','.rs','.php','.rb','.swift','.kt','.html','.css','.scss','.vue','.svelte','.xml','.yml','.yaml','.toml','.ini','.sh','.bat','.ps1','.sql','.graphql','.proto','.gitignore','.editorconfig']);
const allowedDotNames = new Set(['.gitignore','.editorconfig','.eslintrc','.prettierrc','.env.example']);

export function normalizeProjectPath(input, { directory = false } = {}) {
  if (typeof input !== 'string' || !input.trim() || input.length > 300 || input.includes('\0')) throw new Error('Every project file needs a valid relative path (maximum 300 characters).');
  const slashPath = input.replaceAll('\\', '/');
  if (slashPath.startsWith('/') || /^[a-zA-Z]:/.test(slashPath)) throw new Error(`Absolute paths are not allowed: ${input}`);
  const parts = slashPath.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe path segment in: ${input}`);
  if (parts.some(part => ['.git','node_modules','__MACOSX'].includes(part.toLowerCase()))) throw new Error(`Repository metadata and dependency folders are not accepted: ${input}`);
  if (directory) return parts.join('/');
  const filename = parts.at(-1);
  if (/^\.env(?:\.|$)/i.test(filename) && filename.toLowerCase() !== '.env.example') throw new Error('Environment secret files are not accepted; use .env.example for documentation.');
  const ext = path.posix.extname(filename).toLowerCase();
  if (!allowedExtensions.has(ext) && !allowedDotNames.has(filename.toLowerCase())) throw new Error(`Unsupported project file type: ${ext || '(no extension)'}`);
  return parts.join('/');
}

export function validateProjectFiles(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) throw new Error(`A project must contain between 1 and ${MAX_FILES} files.`);
  const seen = new Set(); let total = 0;
  return files.map(file => {
    const filePath = normalizeProjectPath(file.path);
    if (seen.has(filePath.toLowerCase())) throw new Error(`Duplicate file path: ${filePath}`);
    seen.add(filePath.toLowerCase());
    if (typeof file.content !== 'string' || file.content.includes('\0')) throw new Error(`File ${filePath} must contain UTF-8 text.`);
    const size = Buffer.byteLength(file.content, 'utf8');
    if (size > MAX_FILE_BYTES) throw new Error(`File ${filePath} exceeds the 1 MiB per-file limit.`);
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new Error('Project source exceeds the 8 MiB total limit.');
    return { path: filePath, content: file.content, size, contentType: 'text/plain; charset=utf-8' };
  });
}
