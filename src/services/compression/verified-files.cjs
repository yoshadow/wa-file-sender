'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isInside } = require('../files/scan-directory.cjs');
const { CompressionError } = require('../../domain/compression.cjs');

function assertEntryName(name) {
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    /[<>:"/\\|?*]/u.test(name) ||
    /[. ]$/u.test(name) ||
    [...name].some((c) => c.codePointAt(0) < 32 || c.codePointAt(0) === 127) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name)
  )
    throw new CompressionError('NAME');
}
function zipName(folder) {
  let name = folder.normalize('NFC').replace(/[<>:"/\\|?*]/gu, '-');
  name = [...name]
    .filter((c) => c.codePointAt(0) >= 32 && c.codePointAt(0) !== 127)
    .slice(0, 50)
    .join('')
    .replace(/[. ]+$/u, '')
    .trim();
  if (!name || name === '.' || name === '..') name = 'Contacto';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name))
    name = `Contacto-${name}`;
  return `${name}.zip`;
}
function identity(info) {
  return {
    dev: info.dev,
    ino: info.ino,
    size: info.size,
    mtimeMs: info.mtimeMs,
    ctimeMs: info.ctimeMs,
  };
}
function sameIdentity(actual, expected) {
  return (
    actual.dev === expected.dev &&
    actual.ino === expected.ino &&
    actual.size === expected.size &&
    actual.mtimeMs === expected.mtimeMs &&
    (expected.ctimeMs === undefined || actual.ctimeMs === expected.ctimeMs)
  );
}
async function assertPaths(plan, file) {
  const directory = path.join(plan.root, plan.folderName);
  if (
    !isInside(plan.root, directory) ||
    path.dirname(directory) !== plan.root ||
    file.path !== path.join(directory, file.name) ||
    path.dirname(file.path) !== directory
  )
    throw new CompressionError('PATH');
  for (const candidate of [plan.root, directory, file.path]) {
    const info = await fs.lstat(candidate);
    if (info.isSymbolicLink() || (await fs.realpath(candidate)) !== candidate)
      throw new CompressionError('PATH');
  }
}

// The generator hashes the exact chunks handed to its consumer, never a second read.
async function* verifiedBytes(plan, file, signal) {
  let handle;
  try {
    signal?.throwIfAborted();
    assertEntryName(file.name);
    await assertPaths(plan, file);
    handle = await fs.open(
      file.path,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW || 0) |
        (constants.O_NONBLOCK || 0),
    );
    const before = await handle.stat();
    if (!before.isFile() || !sameIdentity(before, file.identity))
      throw new CompressionError('CHANGED');
    const hash = createHash('sha256');
    let total = 0;
    while (true) {
      signal?.throwIfAborted();
      const buffer = Buffer.allocUnsafe(64 * 1024);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, total);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > file.identity.size) throw new CompressionError('CHANGED');
      const chunk = buffer.subarray(0, bytesRead);
      hash.update(chunk);
      yield chunk;
    }
    const sha256 = hash.digest('hex');
    if (
      total !== file.identity.size ||
      !sameIdentity(await handle.stat(), file.identity) ||
      (file.sha256 && sha256 !== file.sha256)
    )
      throw new CompressionError('CHANGED');
    await assertPaths(plan, file);
    file.verifiedHash = sha256;
  } finally {
    if (handle) await handle.close();
  }
}

async function prepareManifest(plan, signal) {
  if (!plan.files.length) throw new CompressionError('EMPTY');
  const names = new Set();
  const files = [];
  for (const input of plan.files) {
    assertEntryName(input.name);
    const key = input.name.normalize('NFC').toLocaleLowerCase('es');
    if (names.has(key)) throw new CompressionError('NAME');
    names.add(key);
  }
  for (const input of [...plan.files].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    assertEntryName(input.name);
    const file = { ...input, identity: { ...input.identity } };
    // Freeze ctime too, after checking against the preview identity.
    await assertPaths(plan, file);
    const info = await fs.lstat(file.path);
    if (!sameIdentity(info, file.identity))
      throw new CompressionError('CHANGED');
    file.identity = identity(info);
    for await (const chunk of verifiedBytes(plan, file, signal)) {
      void chunk;
    }
    file.sha256 = file.verifiedHash;
    delete file.verifiedHash;
    files.push(file);
  }
  const manifest = files.map((file) => ({
    name: file.name,
    size: file.identity.size,
    sha256: file.sha256,
  }));
  const bundleHash = createHash('sha256')
    .update(JSON.stringify(manifest))
    .digest('hex');
  return {
    ...plan,
    files,
    zipName: zipName(plan.folderName),
    manifest,
    bundleHash,
    totalBytes: manifest.reduce((sum, file) => sum + file.size, 0),
  };
}

module.exports = { prepareManifest, verifiedBytes, zipName, assertEntryName };
