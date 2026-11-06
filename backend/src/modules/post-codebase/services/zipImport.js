import yauzl from 'yauzl';
import { MAX_ARCHIVE_BYTES, MAX_ARCHIVE_ENTRIES, MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_BYTES, normalizeProjectPath, validateProjectFiles } from './filePolicy.js';

function openZip(buffer) {
  return new Promise((resolve, reject) => yauzl.fromBuffer(buffer, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, zip) => error ? reject(new Error('The uploaded file is not a valid ZIP archive.')) : resolve(zip)));
}

function readEntry(zip, entry) {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) return reject(new Error('Could not read a ZIP entry.'));
      const chunks = []; let total = 0;
      stream.on('data', chunk => { total += chunk.length; if (total > MAX_FILE_BYTES) stream.destroy(new Error('An archive file exceeds 1 MiB.')); else chunks.push(chunk); });
      stream.on('error', () => reject(new Error('ZIP entry could not be safely decompressed.')));
      stream.on('end', () => {
        try { const buffer = Buffer.concat(chunks); resolve(new TextDecoder('utf-8', { fatal: true }).decode(buffer)); }
        catch { reject(new Error('All project files must be valid UTF-8 text.')); }
      });
    });
  });
}

export async function extractSafeZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer.length > MAX_ARCHIVE_BYTES) throw new Error('ZIP archives must be between 4 bytes and 10 MiB.');
  const zip = await openZip(buffer);
  return new Promise((resolve, reject) => {
    const files = []; const names = new Set(); let totalUncompressed = 0; let count = 0; let entryCount = 0; let finished = false;
    const fail = error => { if (!finished) { finished = true; zip.close(); reject(error); } };
    zip.on('error', () => fail(new Error('The uploaded file is not a valid ZIP archive.')));
    zip.on('end', () => {
      if (finished) return;
      finished = true;
      try { resolve(validateProjectFiles(files)); } catch (error) { reject(error); }
    });
    zip.on('entry', async entry => {
      if (finished) return;
      try {
        entryCount++;
        if (entryCount > MAX_ARCHIVE_ENTRIES) throw new Error(`ZIP archives are limited to ${MAX_ARCHIVE_ENTRIES} total entries.`);
        const isDirectory = entry.fileName.endsWith('/');
        const normalized = normalizeProjectPath(entry.fileName.replace(/\/$/, ''), { directory: isDirectory });
        if (entry.generalPurposeBitFlag & 1) throw new Error('Encrypted ZIP entries are not accepted.');
        const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
        if ((mode & 0o170000) === 0o120000) throw new Error('Symbolic links are not accepted in ZIP archives.');
        if (isDirectory) { zip.readEntry(); return; }
        count++;
        if (count > MAX_FILES) throw new Error(`ZIP archives are limited to ${MAX_FILES} files.`);
        if (entry.uncompressedSize > MAX_FILE_BYTES || (entry.compressedSize === 0 && entry.uncompressedSize > 0) || (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 100)) throw new Error('ZIP entry size or compression ratio exceeds safety limits.');
        totalUncompressed += entry.uncompressedSize;
        if (totalUncompressed > MAX_TOTAL_BYTES) throw new Error('ZIP archive expands beyond the 8 MiB project limit.');
        if (names.has(normalized.toLowerCase())) throw new Error(`Duplicate file path: ${normalized}`);
        names.add(normalized.toLowerCase());
        files.push({ path: normalized, content: await readEntry(zip, entry) });
        zip.readEntry();
      } catch (error) { fail(error); }
    });
    zip.readEntry();
  });
}
