'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { createHash, randomBytes } = require('node:crypto');
const {
  scanDirectory,
} = require('../../src/services/files/scan-directory.cjs');
const {
  prepareManifest,
  verifiedBytes,
  zipName,
  assertEntryName,
} = require('../../src/services/compression/verified-files.cjs');
const {
  createDocumentZip,
  cleanDocumentZips,
  MAX_ZIP_BYTES,
} = require('../../src/services/compression/document-zip.cjs');
const {
  CompressionSession,
} = require('../../src/services/compression/session.cjs');
const { readZip } = require('../helpers/read-zip.cjs');

async function fixture(run) {
  // Windows may expose the temp directory through an 8.3 alias; plans use real paths.
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(tmpdir(), 'wa-compression-')),
  );
  try {
    const root = path.join(directory, 'originales');
    const folderName = 'Ana Pérez';
    await fs.mkdir(path.join(root, folderName), { recursive: true });
    await fs.writeFile(
      path.join(root, folderName, 'Prueba á.txt'),
      'Texto ficticio á',
    );
    await fs.writeFile(
      path.join(root, folderName, 'Otro.bin'),
      Buffer.from([0, 1, 2, 255]),
    );
    const temp = path.join(directory, 'temporales');
    await cleanDocumentZips(temp);
    const plan = {
      root,
      folderName,
      rowId: 'row',
      contactName: folderName,
      phone: '+12025550123',
      revision: 'revision',
      files: (await scanDirectory(root)).folders[0].files,
    };
    await run({ directory, root, temp, plan });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('document ZIP preserves selected names and bytes without credentials; original files remain intact and temp permissions are private', async () =>
  fixture(async ({ plan, temp }) => {
    const prepared = await prepareManifest(plan);
    const zip = await createDocumentZip(temp, prepared);
    const entries = readZip(await fs.readFile(zip.file));
    assert.deepEqual([...entries.keys()], ['Otro.bin', 'Prueba á.txt']);
    for (const file of plan.files)
      assert.deepEqual(entries.get(file.name), await fs.readFile(file.path));
    assert.equal(zip.name, 'Ana Pérez.zip');
    assert.equal(zip.name.includes('12025550123'), false);
    if (process.platform !== 'win32') {
      assert.equal((await fs.stat(zip.directory)).mode & 0o777, 0o700);
      assert.equal((await fs.stat(zip.file)).mode & 0o777, 0o600);
    }
    await cleanDocumentZips(temp);
    assert.deepEqual(await fs.readdir(temp), []);
    assert.equal(
      (await fs.readdir(path.join(plan.root, plan.folderName))).length,
      2,
    );
  }));

test('manifest uses deterministic sorted file names and SHA-256; unselected files are absent and empty selection is rejected', async () =>
  fixture(async ({ plan }) => {
    const first = await prepareManifest(plan);
    const reversed = await prepareManifest({
      ...plan,
      files: [...plan.files].reverse(),
    });
    assert.equal(first.bundleHash, reversed.bundleHash);
    for (const file of first.manifest)
      assert.equal(
        file.sha256,
        createHash('sha256')
          .update(
            await fs.readFile(path.join(plan.root, plan.folderName, file.name)),
          )
          .digest('hex'),
      );
    const subset = await prepareManifest({ ...plan, files: [plan.files[0]] });
    assert.equal(subset.files.length, 1);
    assert.notEqual(subset.bundleHash, first.bundleHash);
    await assert.rejects(prepareManifest({ ...plan, files: [] }), {
      code: 'EMPTY',
    });
  }));

test('changed files require a new preview before hashing and a new review after hashing, with no partial ZIP retained', async () =>
  fixture(async ({ plan, temp }) => {
    const prepared = await prepareManifest(plan);
    const file = plan.files[0];
    await fs.writeFile(file.path, 'Contenido modificado');
    await assert.rejects(prepareManifest(plan), { code: 'CHANGED' });
    await assert.rejects(createDocumentZip(temp, prepared), {
      code: 'CHANGED',
    });
    assert.deepEqual(await fs.readdir(temp), []);
  }));

test('the stream verifies the bytes actually consumed and detects edits during reading', async () =>
  fixture(async ({ plan }) => {
    const file = plan.files[0];
    await fs.writeFile(file.path, Buffer.alloc(256 * 1024, 65));
    plan.files = (await scanDirectory(plan.root)).folders[0].files;
    const prepared = await prepareManifest(plan);
    const input = prepared.files.find((item) => item.path === file.path);
    const iterator = verifiedBytes(prepared, input);
    assert.equal((await iterator.next()).done, false);
    const handle = await fs.open(file.path, 'r+');
    try {
      await handle.write(Buffer.from('B'), 0, 1, 200 * 1024);
    } finally {
      await handle.close();
    }
    await assert.rejects(
      async () => {
        for await (const chunk of iterator) void chunk;
      },
      { code: 'CHANGED' },
    );
  }));

test('same-size changes with restored mtime are detected by identity or content hash', async () =>
  fixture(async ({ plan, temp }) => {
    const prepared = await prepareManifest(plan);
    const file = prepared.files[0];
    const original = await fs.stat(file.path);
    await fs.writeFile(file.path, Buffer.alloc(original.size, 42));
    await fs.utimes(file.path, original.atime, original.mtime);
    // Ignore timestamps in this assertion to specifically exercise approved-byte hashing.
    file.identity = {
      ...file.identity,
      mtimeMs: (await fs.stat(file.path)).mtimeMs,
      ctimeMs: (await fs.stat(file.path)).ctimeMs,
    };
    await assert.rejects(createDocumentZip(temp, prepared), {
      code: 'CHANGED',
    });
    assert.deepEqual(await fs.readdir(temp), []);
  }));

test('paths outside the root and symbolic-link replacement are rejected', async (t) =>
  fixture(async ({ plan, temp, directory }) => {
    await assert.rejects(
      prepareManifest({
        ...plan,
        files: [
          { ...plan.files[0], path: path.join(directory, 'outside.txt') },
        ],
      }),
      { code: 'PATH' },
    );
    const prepared = await prepareManifest(plan);
    const file = plan.files[0];
    await fs.rename(file.path, path.join(directory, 'outside.txt'));
    try {
      await fs.symlink(path.join(directory, 'outside.txt'), file.path, 'file');
    } catch (error) {
      if (error.code === 'EPERM') {
        t.skip('El sistema no permite crear enlaces.');
        return;
      }
      throw error;
    }
    await assert.rejects(createDocumentZip(temp, prepared), { code: 'PATH' });
    assert.deepEqual(await fs.readdir(temp), []);
  }));

test('ZIP names are sanitized without changing internal names; ambiguous or nonportable entries are rejected', async () =>
  fixture(async ({ plan }) => {
    assert.equal(zipName('CON'), 'Contacto-CON.zip');
    assert.equal(zipName('Ana: Documentos. '), 'Ana- Documentos.zip');
    for (const name of ['../x', 'a\\b', 'CON.txt', 'x.', 'a:b', 'nul', 'x\n'])
      assert.throws(() => assertEntryName(name), { code: 'NAME' });
    await assert.rejects(
      prepareManifest({
        ...plan,
        files: [
          plan.files[0],
          { ...plan.files[0], name: plan.files[0].name.toUpperCase() },
        ],
      }),
      { code: 'NAME' },
    );
  }));

test('real 20 MiB output limit stops incompressible data and removes the partial ZIP', async () =>
  fixture(async ({ plan, temp }) => {
    assert.equal(MAX_ZIP_BYTES, 20 * 1024 * 1024);
    await fs.writeFile(plan.files[0].path, randomBytes(MAX_ZIP_BYTES + 1024));
    plan.files = (await scanDirectory(plan.root)).folders[0].files;
    await assert.rejects(createDocumentZip(temp, await prepareManifest(plan)), {
      code: 'LIMIT',
    });
    assert.deepEqual(await fs.readdir(temp), []);
  }));

test('space shortage and cleanup failures are explicit blockers; startup removes only own stale temporaries', async () =>
  fixture(async ({ plan, temp }) => {
    const prepared = await prepareManifest(plan);
    await assert.rejects(
      createDocumentZip(temp, prepared, undefined, {
        io: { ...fs, statfs: async () => ({ bavail: 0n, bsize: 1n }) },
      }),
      { code: 'SPACE' },
    );
    await fs.mkdir(path.join(temp, 'zip-Ab1234'));
    await fs.writeFile(
      path.join(temp, 'zip-Ab1234', 'incomplete.zip'),
      'ficticio',
    );
    await fs.writeFile(path.join(temp, 'keep.txt'), 'no es temporal propio');
    await assert.rejects(
      cleanDocumentZips(temp, {
        ...fs,
        rm: async () => {
          throw new Error('SECRET');
        },
      }),
      { code: 'CLEANUP' },
    );
    await cleanDocumentZips(temp);
    assert.deepEqual(await fs.readdir(temp), ['keep.txt']);
  }));

test('cancelled preparation and compression never produce a usable artifact', async () =>
  fixture(async ({ plan, temp }) => {
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(prepareManifest(plan, abort.signal), {
      name: 'AbortError',
    });
    await assert.rejects(
      createDocumentZip(temp, await prepareManifest(plan), abort.signal),
      { code: 'CANCELLED' },
    );
    assert.deepEqual(await fs.readdir(temp), []);
  }));

test('session retains one ZIP at a time, validates review tokens and clears prior artifacts', async () =>
  fixture(async ({ plan, temp }) => {
    const session = new CompressionSession(temp);
    const review = await session.prepare(plan);
    assert.equal(JSON.stringify(review).includes(plan.root), false);
    await assert.rejects(session.generate('stale'), { code: 'CHANGED' });
    await session.generate(review.token);
    assert.equal((await fs.readdir(temp)).length, 1);
    await session.prepare(plan);
    assert.deepEqual(await fs.readdir(temp), []);
    await session.reset();
  }));

test('active compression cancellation cleans partial output and reports CANCELLED', async () =>
  fixture(async ({ plan, temp }) => {
    await fs.writeFile(plan.files[0].path, randomBytes(2 * 1024 * 1024));
    plan.files = (await scanDirectory(plan.root)).folders[0].files;
    const prepared = await prepareManifest(plan);
    const abort = new AbortController();
    const pending = createDocumentZip(temp, prepared, abort.signal);
    const timer = setImmediate(() => abort.abort());
    try {
      await assert.rejects(pending, { code: 'CANCELLED' });
    } finally {
      clearImmediate(timer);
    }
    assert.deepEqual(await fs.readdir(temp), []);
  }));

test('a cancellation during initial cleanup is retained before hashing begins', async () =>
  fixture(async ({ plan, temp }) => {
    const session = new CompressionSession(temp);
    const pending = session.prepare(plan);
    session.cancel();
    await assert.rejects(pending, { code: 'CANCELLED' });
    assert.equal(session.prepared, null);
    assert.deepEqual(await fs.readdir(temp), []);
  }));
