import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const backendRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const defaultRoot = path.join(backendRoot, 'storage-data', 'codebases');
const configuredRoot = process.env.CODEBASE_STORAGE_DIR;
const root = path.resolve(configuredRoot ? (path.isAbsolute(configuredRoot) ? configuredRoot : path.join(backendRoot, configuredRoot)) : defaultRoot);
const validKey = /^[0-9a-f-]{36}$/i;

export const localFileStorage = {
  async put(buffer) {
    const key = randomUUID();
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, `${key}.txt`), buffer, { flag: 'wx', mode: 0o600 });
    return key;
  },
  async get(key) {
    if (typeof key !== 'string' || !validKey.test(key)) throw new Error('Invalid storage key.');
    return readFile(path.join(root, `${key}.txt`));
  },
  async remove(key) {
    if (typeof key !== 'string' || !validKey.test(key)) return;
    await rm(path.join(root, `${key}.txt`), { force: true });
  }
};
