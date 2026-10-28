'use strict';

const fs = require('node:fs/promises');
const { createWriteStream } = require('node:fs');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { verifiedBytes } = require('./verified-files.cjs');
const { CompressionError, safeCode } = require('../../domain/compression.cjs');
const MAX_ZIP_BYTES = 20 * 1024 * 1024;

async function cleanDocumentZips(root, io = fs) {
  try {
    await io.mkdir(root, { recursive: true, mode: 0o700 });
    if ((await io.lstat(root)).isSymbolicLink()) throw new Error('Linked root');
    await io.chmod(root, 0o700);
    for (const name of await io.readdir(root)) {
      if (/^zip-[a-zA-Z0-9]+$/u.test(name))
        await io.rm(path.join(root, name), { recursive: true, force: true });
    }
  } catch {
    throw new CompressionError('CLEANUP');
  }
}

async function createDocumentZip(
  root,
  prepared,
  signal,
  { io = fs, maxBytes = MAX_ZIP_BYTES } = {},
) {
  let directory;
  let archive;
  let done;
  const inputs = [];
  try {
    signal?.throwIfAborted();
    const available = await io.statfs(root, { bigint: true });
    const estimate = Math.min(
      prepared.totalBytes + prepared.files.length * 1024 + 65536,
      maxBytes + 65536,
    );
    if (available.bavail * available.bsize < BigInt(Math.ceil(estimate)))
      throw new CompressionError('SPACE');
    directory = await io.mkdtemp(path.join(root, 'zip-'));
    await io.chmod(directory, 0o700);
    const file = path.join(directory, prepared.zipName);
    const { ZipArchive } = await import('archiver');
    archive = new ZipArchive({ zlib: { level: 6 } });
    let size = 0;
    const hash = createHash('sha256');
    const limit = new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length;
        hash.update(chunk);
        callback(size > maxBytes ? new CompressionError('LIMIT') : null, chunk);
      },
    });
    done = pipeline(
      archive,
      limit,
      createWriteStream(file, { flags: 'wx', mode: 0o600 }),
      { signal },
    );
    done.catch(() => {});
    archive.on('warning', (error) => archive.destroy(error));
    for (const item of prepared.files) {
      const input = Readable.from(verifiedBytes(prepared, item, signal));
      input.on('error', (error) => archive.destroy(error));
      inputs.push(input);
      archive.append(input, {
        name: item.name,
        date: new Date('2026-01-01T00:00:00Z'),
        mode: 0o600,
      });
    }
    // The pipeline owns failure propagation, including archive/input errors.
    archive.finalize().catch((error) => archive.destroy(error));
    await done;
    return {
      directory,
      file,
      name: prepared.zipName,
      size,
      sha256: hash.digest('hex'),
    };
  } catch (error) {
    for (const input of inputs) input.destroy();
    archive?.destroy();
    if (done) await done.catch(() => {});
    // Let streams close their file handles before deleting on Windows.
    await Promise.all(
      inputs.map((input) =>
        input.closed
          ? Promise.resolve()
          : new Promise((resolve) => input.once('close', resolve)),
      ),
    );
    if (directory) {
      try {
        await io.rm(directory, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      } catch {
        throw new CompressionError('CLEANUP');
      }
    }
    throw new CompressionError(safeCode(error));
  }
}

module.exports = { cleanDocumentZips, createDocumentZip, MAX_ZIP_BYTES };
