import { validateProjectFiles } from './filePolicy.js';
import { localFileStorage } from './localFileStorage.js';

export async function persistProjectFiles(files) {
  const valid = validateProjectFiles(files);
  const written = [];
  try {
    const result = [];
    for (const file of valid) {
      const storageKey = await localFileStorage.put(Buffer.from(file.content, 'utf8'));
      written.push(storageKey);
      result.push({ path: file.path, size: file.size, contentType: file.contentType, storageKey });
    }
    return result;
  } catch (error) {
    await Promise.all(written.map(key => localFileStorage.remove(key)));
    throw error;
  }
}

export async function readProjectFiles(files = []) {
  return Promise.all(files.map(async file => ({
    path: file.path,
    content: file.storageKey ? (await localFileStorage.get(file.storageKey)).toString('utf8') : (file.content || '')
  })));
}

export async function removeProjectFiles(files = []) {
  await Promise.all(files.map(file => file.storageKey && localFileStorage.remove(file.storageKey)));
}

export async function updateStoredProjectFile(doc, file, expectedVersion) {
  if (expectedVersion !== undefined && Number(expectedVersion) !== doc.version) { const error = new Error('This codebase changed since you opened it. Reload and retry.'); error.code = 'VERSION_CONFLICT'; throw error; }
  const index = doc.files.findIndex(item => item.path === file.path);
  if (index < 0) { const error = new Error('Project file was not found.'); error.code = 'FILE_NOT_FOUND'; throw error; }
  const old = doc.files[index];
  const storageKey = await localFileStorage.put(Buffer.from(file.content, 'utf8'));
  doc.files.set(index, { path: file.path, size: file.size, contentType: file.contentType, storageKey });
  doc.version += 1;
  try { await doc.save(); }
  catch (error) { await localFileStorage.remove(storageKey); throw error; }
  await removeProjectFiles([old]);
  return doc;
}

export function fileTree(files = [], directories = []) {
  const values = new Set(directories);
  for (const file of files) {
    const parts = file.path.split('/');
    parts.pop();
    while (parts.length) { values.add(parts.join('/')); parts.pop(); }
  }
  return { directories: [...values].sort(), files: files.map(({ path, size, contentType }) => ({ path, size, contentType })) };
}
