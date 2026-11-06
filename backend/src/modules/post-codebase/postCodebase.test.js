import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProjectPath, validateProjectFiles } from './services/filePolicy.js';
import { extractSafeZip } from './services/zipImport.js';
import { persistProjectFiles, readProjectFiles, removeProjectFiles } from './services/projectFiles.js';
import { parsePublicGitHubUrl } from './services/githubImport.js';
import { validateCodebaseInput } from './validators/codebaseInput.js';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries) {
  const locals = []; const centrals = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name); const body = Buffer.from(entry.content || ''); const crc = crc32(body);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(entry.externalAttributes || 0, 38); central.writeUInt32LE(offset, 42);
    centrals.push(central, name); offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(centrals); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test('project file paths reject traversal, absolute paths, secrets, and unsupported binaries', () => {
  for (const value of ['../escape.js', 'src/../../escape.js', '/etc/passwd', 'C:\\secret.js', '.env', 'bin/program.exe']) assert.throws(() => normalizeProjectPath(value));
  assert.equal(normalizeProjectPath('src\\main.js'), 'src/main.js');
  assert.throws(() => validateProjectFiles([{ path: 'src/a.js', content: 'a' }, { path: 'src/a.js', content: 'b' }]), /Duplicate/);
  assert.throws(() => validateProjectFiles([{ path: 'src/lib.js', content: 'a' }, { path: 'src/lib.js/main.js', content: 'b' }]), /both a file and a directory/);
});

test('ZIP importer accepts bounded text source and rejects traversal and symlink entries', async () => {
  const good = await extractSafeZip(zip([{ name: 'sample/', content: '' }, { name: 'sample/src/main.js', content: 'export const ok = true;' }, { name: 'README.md', content: '# Project' }]));
  assert.equal(good.length, 2);
  assert.equal(good[0].content, 'export const ok = true;');
  await assert.rejects(extractSafeZip(zip([{ name: '../escape.js', content: 'bad' }])), /valid ZIP|Unsafe path/);
  await assert.rejects(extractSafeZip(zip([{ name: 'link.js', content: 'target', externalAttributes: (0o120777 << 16) >>> 0 }])), /Symbolic links/);
  await assert.rejects(extractSafeZip(Buffer.from('not a ZIP')), /valid ZIP/);
});

test('source storage persists text by generated key and keeps path metadata separate', async () => {
  const descriptors = await persistProjectFiles([{ path: 'src/main.js', content: 'console.log("ok")' }]);
  assert.equal(Object.hasOwn(descriptors[0], 'content'), false);
  const restored = await readProjectFiles(descriptors);
  assert.deepEqual(restored, [{ path: 'src/main.js', content: 'console.log("ok")' }]);
  await removeProjectFiles(descriptors);
});

test('metadata validation blocks mass assignment and enforces publish field formats', () => {
  assert.throws(() => validateCodebaseInput({ title: 'x', description: 'y', ownerId: 'attacker' }), /Unsupported fields/);
  assert.throws(() => validateCodebaseInput({ title: 'x', description: 'y', difficulty: 'Impossible' }), /difficulty/);
  assert.throws(() => validateCodebaseInput({ title: 'x', description: 'y', commands: { deploy: 'secret' } }), /commands/);
  assert.throws(() => validateCodebaseInput({ title: 'x', description: 'y', directories: ['../outside'] }), /Unsafe path/);
  const input = validateCodebaseInput({ title: 'x', description: 'y', estimatedMinutes: 40, acceptanceCriteria: ['Works'] });
  assert.equal(input.estimatedMinutes, 40);
});

test('GitHub URL parser accepts only canonical public GitHub repository URLs', () => {
  assert.deepEqual(parsePublicGitHubUrl('https://github.com/acme/demo.git'), { owner: 'acme', repository: 'demo', canonicalUrl: 'https://github.com/acme/demo' });
  for (const value of ['http://github.com/acme/demo', 'https://github.com.evil.test/acme/demo', 'https://github.com/acme/demo/tree/main', 'https://user:pass@github.com/acme/demo']) assert.throws(() => parsePublicGitHubUrl(value));
});
