'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');
const {
  scanDirectory,
  isInside,
  MAX_ENTRIES,
  MAX_FOLDERS,
} = require('../../src/services/files/scan-directory.cjs');
const {
  PreviewService,
  validateSelectionArguments,
} = require('../../src/services/files/preview.cjs');
const {
  parseContactsCsv,
} = require('../../src/services/contacts/parse-csv.cjs');

const contacts = (
  csv = 'Ana Pérez,+12025550123\nBruno,+12025550124\nSara,+12025550125',
) => parseContactsCsv(Buffer.from('nombre,telefono\n' + csv));
const readable = (name = 'Prueba.txt', size = 12) => ({
  name,
  size,
  readable: true,
  reason: null,
  path: '/private/documents/' + name,
  identity: { ino: 123 },
});
const folder = (name, files = [readable()]) => ({ name, files, issues: [] });
const scanned = (folders) => ({
  root: '/private/documents',
  name: 'documents',
  folders,
  excluded: [],
});
function preview(folders) {
  const service = new PreviewService({
    selectDirectory: async () => '/private/documents',
    scan: async () => scanned(folders),
  });
  service.setContacts(contacts());
  return service;
}
function select(service, id, selected = true) {
  return service.select({
    revision: service.snapshot().revision,
    id,
    selected,
  });
}

test('successful sends clear selection once while allowing voluntary selection and later resends', async () => {
  const service = preview([folder('Ana Pérez')]);
  let state = await service.selectRoot();
  const row = state.rows.find((item) => item.contactName === 'Ana Pérez');
  select(service, row.id);
  const first = [{ id: 'send-1', phone: row.phone }];
  service.clearSentSelections(first, 'account-a');
  assert.equal(service.snapshot().selectedCount, 0);
  assert.equal(select(service, row.id).selectedCount, 1);
  service.clearSentSelections(first, 'account-a');
  assert.equal(service.snapshot().selectedCount, 1);
  assert.equal(service.batchPlans(service.snapshot().revision).plans.length, 1);
  service.clearSentSelections(
    [{ id: 'send-2', phone: row.phone }],
    'account-a',
  );
  assert.equal(service.snapshot().selectedCount, 0);
  service.setContacts(contacts());
  state = await service.selectRoot();
  const imported = state.rows.find((item) => item.contactName === 'Ana Pérez');
  assert.equal(select(service, imported.id).selectedCount, 1);
  service.clearSentSelections(
    [{ id: 'send-2', phone: row.phone }],
    'account-a',
  );
  assert.equal(service.snapshot().selectedCount, 1);
});

test('folder matching uses NFC, exterior whitespace and case, preserves accents, and reports missing and empty associations', async () => {
  const service = preview([
    folder(' ANA PE\u0301REZ '),
    folder('Bruno', []),
    folder('Ana Perez'),
    folder('Sin contacto'),
  ]);
  const result = await service.selectRoot();
  assert.equal(result.eligibleCount, 1);
  assert.equal(result.rows[0].phone, '+12025550123');
  assert.equal(result.rows[1].eligible, false);
  assert.ok(result.rows[1].issues.includes('Carpeta vacía.'));
  assert.ok(result.rows[2].issues.includes('Carpeta sin contacto en el CSV.'));
  assert.equal(
    result.rows.find((row) => row.contactName === 'Sara').folderName,
    null,
  );
  assert.equal(result.selectedCount, 0);
});

test('ambiguous folders and invalid or duplicated CSV contacts block every affected association', async () => {
  const service = preview([
    folder('Bruno'),
    folder(' BRUNO '),
    folder('Ana Pérez'),
    folder('Carla'),
  ]);
  service.setContacts(
    contacts(
      'Bruno,+12025550124\nAna Pérez,+12025550123\nANA PÉREZ,+12025550125\nCarla,123',
    ),
  );
  const result = await service.selectRoot();
  assert.equal(result.eligibleCount, 0);
  for (const row of result.rows) {
    assert.equal(row.eligible, false);
    assert.throws(() => select(service, row.id), /no es válido/);
  }
});

test('selection includes only readable files and valid recipients, counts bytes and rejects stale revisions and unknown identifiers', async () => {
  const service = preview([
    folder('Ana Pérez', [
      readable('Uno.txt', 10),
      readable('Dos.txt', 20),
      { name: 'Excluido', readable: false, size: null, reason: 'Ilegible' },
    ]),
  ]);
  let state = await service.selectRoot();
  const row = state.rows[0];
  state = select(service, row.id);
  assert.equal(state.selectedCount, 1);
  assert.equal(state.selectedFileCount, 2);
  assert.equal(state.selectedBytes, 30);
  assert.equal(state.rows[0].files[2].selected, false);
  assert.throws(
    () => service.select({ id: row.id, selected: false, revision: 'old' }),
    /cambió/,
  );
  assert.throws(() => select(service, '/etc/passwd'), /no es válido/);
  assert.throws(() => select(service, row.files[2].id), /excluido/);
  state = select(service, row.files[0].id, false);
  assert.equal(state.selectedBytes, 20);
  state = select(service, row.files[1].id, false);
  assert.equal(state.selectedCount, 0);
  assert.equal(JSON.stringify(state).includes('/private/'), false);
  assert.equal(JSON.stringify(state).includes('identity'), false);
});

test('CSV changes and clear discard selection, cancellation preserves it, failed scans discard stale rows', async () => {
  const service = preview([folder('Ana Pérez')]);
  let state = await service.selectRoot();
  state = select(service, state.rows[0].id);
  service.selectDirectory = async () => null;
  assert.equal((await service.selectRoot()).selectedCount, 1);
  service.setContacts(contacts());
  assert.equal(service.snapshot().status, 'empty');
  assert.equal(service.snapshot().selectedCount, 0);
  assert.throws(
    () =>
      service.select({
        id: state.rows[0].id,
        selected: true,
        revision: state.revision,
      }),
    /cambió/,
  );
  service.selectDirectory = async () => '/private/documents';
  await service.selectRoot();
  service.scan = async () => {
    throw new Error('SECRET /private/documents');
  };
  state = await service.selectRoot();
  assert.equal(state.status, 'error');
  assert.equal(state.rows.length, 0);
  assert.equal(state.error.includes('SECRET'), false);
  assert.equal(service.clear().status, 'empty');
});

test('pending folder selection blocks parallel changes and requires a valid contact', async () => {
  const service = preview([]);
  let release;
  service.selectDirectory = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const pending = service.selectRoot();
  assert.equal(service.snapshot().busy, true);
  await assert.rejects(service.selectRoot(), /termine/);
  assert.throws(() => service.setContacts(contacts()), /termine/);
  assert.throws(() => service.clear(), /termine/);
  release(null);
  await pending;
  service.setContacts(contacts('Invalido,123'));
  await assert.rejects(service.selectRoot(), /contacto válido/);
});

test('selection IPC accepts only one revision, opaque identifier and boolean, never filesystem arguments', () => {
  validateSelectionArguments([
    { id: 'uuid', revision: 'uuid', selected: true },
  ]);
  for (const request of [
    null,
    [],
    {},
    { id: 'x', revision: 'r', selected: 1 },
    { id: 'x', revision: 'r', selected: true, path: '/etc/passwd' },
    { id: 'x'.repeat(81), revision: 'r', selected: true },
  ])
    assert.throws(() => validateSelectionArguments([request]), /no es válida/);
  assert.throws(() => validateSelectionArguments([]), /no es válida/);
});

async function withTree(run) {
  const temporary = await fs.realpath(
    await fs.mkdtemp(path.join(tmpdir(), 'wa-preview-')),
  );
  try {
    const root = path.join(temporary, 'principal');
    await fs.mkdir(path.join(root, 'Ana Pérez', 'Interna'), {
      recursive: true,
    });
    await fs.mkdir(path.join(root, 'Bruno'));
    await fs.writeFile(
      path.join(root, 'Ana Pérez', 'Prueba.txt'),
      'Texto ficticio',
    );
    await fs.writeFile(
      path.join(root, 'Ana Pérez', 'Interna', 'Ignorado.txt'),
      'No recursivo',
    );
    await fs.writeFile(path.join(root, 'Suelto.txt'), 'Sin destinatario');
    await run(root, temporary);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

test('scanner lists only direct files without reading document contents or modifying originals', async () =>
  withTree(async (root) => {
    const io = {
      ...fs,
      open: async (...args) => {
        const handle = await fs.open(...args);
        return {
          stat: () => handle.stat(),
          close: () => handle.close(),
          read: () => assert.fail('Preview must not read document contents'),
        };
      },
    };
    const state = await scanDirectory(root, io);
    const ana = state.folders.find((row) => row.name === 'Ana Pérez');
    assert.equal(ana.files.length, 2);
    assert.equal(
      ana.files.find((file) => file.name === 'Prueba.txt').size,
      Buffer.byteLength('Texto ficticio'),
    );
    assert.equal(
      ana.files.find((file) => file.name === 'Interna').readable,
      false,
    );
    assert.equal(
      state.folders.find((row) => row.name === 'Bruno').files.length,
      0,
    );
    assert.equal(state.excluded[0].name, 'Suelto.txt');
    assert.equal(
      await fs.readFile(path.join(root, 'Ana Pérez', 'Prueba.txt'), 'utf8'),
      'Texto ficticio',
    );
  }));

test('unreadable files and directories are visible and excluded without exposing raw errors', async () =>
  withTree(async (root) => {
    const io = {
      ...fs,
      access: async () => {
        throw new Error('SECRET permission failure');
      },
      opendir: async (file) => {
        if (path.basename(file) === 'Bruno')
          throw new Error('SECRET directory');
        return fs.opendir(file);
      },
    };
    const state = await scanDirectory(root, io);
    assert.equal(
      state.folders
        .find((row) => row.name === 'Ana Pérez')
        .files.every((file) => !file.readable),
      true,
    );
    assert.equal(
      state.folders.find((row) => row.name === 'Bruno').issues.length,
      1,
    );
    assert.equal(JSON.stringify(state).includes('SECRET'), false);
  }));

test('symbolic links to internal or external paths and a linked root are excluded', async (t) =>
  withTree(async (root, temporary) => {
    const outside = path.join(temporary, 'Fuera.txt');
    await fs.writeFile(outside, 'No incluir');
    try {
      await fs.symlink(
        outside,
        path.join(root, 'Ana Pérez', 'Fuera.txt'),
        'file',
      );
      await fs.symlink(
        path.join(root, 'Ana Pérez', 'Prueba.txt'),
        path.join(root, 'Ana Pérez', 'Dentro.txt'),
        'file',
      );
      await fs.symlink(
        root,
        path.join(temporary, 'RaizEnlace'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      await fs.symlink(
        path.join(root, 'Ana Pérez'),
        path.join(root, 'EnlaceCarpeta'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    } catch (error) {
      if (error.code === 'EPERM') {
        t.skip('El sistema no permite crear enlaces de prueba.');
        return;
      }
      throw error;
    }
    const state = await scanDirectory(root);
    assert.equal(
      state.excluded.some((entry) => entry.name === 'EnlaceCarpeta'),
      true,
    );
    const files = state.folders.find((row) => row.name === 'Ana Pérez').files;
    assert.equal(files.filter((file) => file.readable).length, 1);
    await assert.rejects(
      scanDirectory(path.join(temporary, 'RaizEnlace')),
      /sin enlaces/,
    );
  }));

test('changed file identity and resolved paths outside the root are rejected during inspection', async () =>
  withTree(async (root) => {
    const file = path.join(root, 'Ana Pérez', 'Prueba.txt');
    const io = {
      ...fs,
      realpath: async (value) =>
        value === file
          ? path.join(path.dirname(root), 'Fuera.txt')
          : fs.realpath(value),
    };
    let state = await scanDirectory(root, io);
    assert.equal(
      state.folders
        .find((row) => row.name === 'Ana Pérez')
        .files.some((entry) => entry.readable),
      false,
    );
    state = await scanDirectory(root, {
      ...fs,
      open: async (...args) => {
        const handle = await fs.open(...args);
        return {
          stat: async () => {
            const info = await handle.stat();
            info.ino++;
            return info;
          },
          close: () => handle.close(),
        };
      },
    });
    assert.equal(
      state.folders
        .find((row) => row.name === 'Ana Pérez')
        .files.some((entry) => entry.readable),
      false,
    );
  }));

test('containment rejects sibling-prefix paths and inspection bounds large entry and folder counts', async () =>
  withTree(async (root) => {
    assert.equal(isInside(root, root), false);
    assert.equal(isInside(root, root + '-outside/file.txt'), false);
    assert.equal(
      isInside(root, path.join(root, 'Ana Pérez', 'Prueba.txt')),
      true,
    );
    const fake = (directories) => ({
      ...fs,
      lstat: async (file) =>
        file === root
          ? fs.lstat(file)
          : { isSymbolicLink: () => false, isDirectory: () => directories },
      realpath: async (file) => file,
      opendir: async (file) =>
        (async function* () {
          if (file === root)
            for (
              let index = 0;
              index <= (directories ? MAX_FOLDERS : MAX_ENTRIES);
              index++
            )
              yield { name: `Entrada${index}` };
        })(),
    });
    await assert.rejects(scanDirectory(root, fake(false)), /10 000 entradas/);
    await assert.rejects(scanDirectory(root, fake(true)), /1 000 subcarpetas/);
  }));
