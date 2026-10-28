'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { SendFailure } = require('../../domain/send-failure.cjs');
const {
  MAX_ZIP_BYTES,
} = require('../../services/compression/document-zip.cjs');
const {
  assertEntryName,
} = require('../../services/compression/verified-files.cjs');
const failure = (code) =>
  new SendFailure({ code, phase: 'zip', mayHaveSent: false });

async function loadDocument(root, zip) {
  let handle;
  try {
    if (
      typeof root !== 'string' ||
      !zip ||
      typeof zip.file !== 'string' ||
      typeof zip.name !== 'string'
    )
      throw failure('ZIP_PATH');
    try {
      assertEntryName(zip.name);
    } catch {
      throw failure('ZIP_PATH');
    }
    const directory = path.dirname(zip.file);
    if (
      path.dirname(directory) !== root ||
      !/^zip-[a-zA-Z0-9]+$/u.test(path.basename(directory)) ||
      path.basename(zip.file) !== zip.name ||
      !zip.name.endsWith('.zip')
    )
      throw failure('ZIP_PATH');
    if (
      !Number.isSafeInteger(zip.size) ||
      zip.size <= 0 ||
      zip.size > MAX_ZIP_BYTES ||
      !/^[a-f0-9]{64}$/u.test(zip.sha256 || '')
    )
      throw failure('ZIP_CHANGED');
    const safePaths = async () => {
      for (const value of [root, directory, zip.file])
        if (
          (await fs.lstat(value)).isSymbolicLink() ||
          (await fs.realpath(value)) !== value
        )
          throw failure('ZIP_PATH');
    };
    await safePaths();
    handle = await fs.open(
      zip.file,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW || 0) |
        (constants.O_NONBLOCK || 0),
    );
    const before = await handle.stat();
    if (!before.isFile() || before.size !== zip.size)
      throw failure('ZIP_CHANGED');
    const chunks = [];
    let total = 0;
    const hash = createHash('sha256');
    while (true) {
      const buffer = Buffer.allocUnsafe(64 * 1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, total);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > zip.size) throw failure('ZIP_CHANGED');
      const chunk = buffer.subarray(0, bytesRead);
      chunks.push(chunk);
      hash.update(chunk);
    }
    const after = await handle.stat();
    if (
      total !== zip.size ||
      hash.digest('hex') !== zip.sha256 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    )
      throw failure('ZIP_CHANGED');
    await safePaths();
    return Buffer.concat(chunks, total);
  } catch (error) {
    throw error instanceof SendFailure ? error : failure('ZIP_READ');
  } finally {
    if (handle) await handle.close();
  }
}
module.exports = { loadDocument };
