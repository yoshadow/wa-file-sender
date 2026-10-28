'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtemp,
  writeFile,
  readFile,
  readdir,
  rm,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const {
  parseContactsCsv,
  MAX_CSV_BYTES,
  MAX_CONTACTS,
} = require('../../src/services/contacts/parse-csv.cjs');
const {
  ContactsService,
} = require('../../src/services/contacts/import-contacts.cjs');

const parse = (text) => parseContactsCsv(Buffer.from(text));
const codes = (row) => row.errors.map((error) => error.code);

test('CSV accepts UTF-8 BOM, CRLF, accents, quoted commas and escaped quotes', () => {
  const result = parse(
    '\uFEFFnombre,telefono\r\n"Pérez, Ana",+1 (202) 555-0123\r\n"Bruno ""Luz""",+12025550124\r\n',
  );
  assert.equal(result.validCount, 2);
  assert.equal(result.rows[0].name, 'Pérez, Ana');
  assert.equal(result.rows[0].normalizedPhone, '+12025550123');
  assert.equal(result.rows[1].name, 'Bruno "Luz"');
  assert.deepEqual(
    result.rows.map((row) => row.line),
    [2, 3],
  );
});

test('headers tolerate surrounding whitespace, case and order but require exactly the two defined names', () => {
  assert.equal(parse(' TELEFONO , Nombre\n+12025550123,Ana').validCount, 1);
  for (const text of [
    'nombre;telefono\nAna;+12025550123',
    'nombre,nombre\nAna,Ana',
    'nombre,teléfono\nAna,+12025550123',
    'nombre,telefono,extra\nAna,+12025550123,x',
    'nombre\nAna',
  ]) {
    const result = parse(text);
    assert.equal(result.fileErrors[0].code, 'INVALID_HEADERS');
    assert.equal(result.rows.length, 0);
  }
});

test('ambiguous names block every affected row using Unicode NFC and case while preserving accents and inner spaces', () => {
  const result = parse(
    'nombre,telefono\nJosé,+12025550123\n JOSE\u0301 ,+12025550124\nJose,+12025550125\nAna  María,+12025550126\nAna María,+12025550127',
  );
  assert.equal(result.validCount, 3);
  assert.ok(codes(result.rows[0]).includes('DUPLICATE_NAME'));
  assert.ok(codes(result.rows[1]).includes('DUPLICATE_NAME'));
  assert.equal(result.rows[1].name, 'JOSÉ');
  assert.equal(result.rows[2].valid, true);
});

test('international phone duplicates are detected after formatting normalization on all affected rows', () => {
  const result = parse(
    'nombre,telefono\nAna,+12025550123\nBruno,+1 (202) 555-0123\nCarla,+12025550124',
  );
  assert.equal(result.validCount, 1);
  for (const row of result.rows.slice(0, 2))
    assert.ok(codes(row).includes('DUPLICATE_PHONE'));
});

test('CSV adds a missing plus to complete international numbers and preserves the original cell', () => {
  const result = parse(
    'nombre,telefono\nAna,12025550123\nBruno,+12025550124\nCarla,1 (202) 555-0125',
  );
  assert.equal(result.validCount, 3);
  assert.equal(result.rows[0].phone, '12025550123');
  assert.deepEqual(
    result.rows.map((row) => row.normalizedPhone),
    ['+12025550123', '+12025550124', '+12025550125'],
  );
});

test('a plus-free number and the same number with plus are duplicates', () => {
  const result = parse('nombre,telefono\nAna,12025550123\nBruno,+12025550123');
  assert.equal(result.validCount, 0);
  assert.ok(result.rows.every((row) => codes(row).includes('DUPLICATE_PHONE')));
});

test('plus insertion never evaluates spreadsheet formulas or guesses digits from scientific notation', () => {
  for (const phone of [
    '1.2025550123E+10',
    '=12025550123',
    '++12025550123',
    '0012025550123',
    '12025550123 ext 4',
  ]) {
    const result = parse(`nombre,telefono\nAna,${phone}`);
    assert.equal(result.rows[0].normalizedPhone, null);
    assert.ok(codes(result.rows[0]).includes('INVALID_PHONE'));
  }
});

test('row errors do not hide valid contacts and never infer a missing country', () => {
  const result = parse(
    'nombre,telefono\n,+12025550123\nAna,\nBruno,2025550124\nCarla,+999123\nDora,+12025550125,extra\nEva,+12025550126',
  );
  assert.equal(result.validCount, 1);
  assert.equal(result.invalidCount, 5);
  assert.ok(codes(result.rows[0]).includes('INVALID_NAME'));
  assert.ok(codes(result.rows[1]).includes('MISSING_PHONE'));
  assert.equal(result.rows[2].normalizedPhone, null);
  assert.ok(codes(result.rows[4]).includes('FIELD_COUNT'));
});

test('blank lines retain physical row context and multiline names are rejected as data errors', () => {
  const result = parse(
    'nombre,telefono\n\n"Ana\nPérez",+12025550123\nBruno,+12025550124',
  );
  assert.equal(result.rows[0].line, 4);
  assert.ok(codes(result.rows[0]).includes('INVALID_NAME'));
  assert.equal(result.rows[1].line, 5);
  assert.equal(result.rows[1].valid, true);
});

test('malformed CSV and invalid UTF-8 discard the entire new dataset without exposing record contents in errors', () => {
  const result = parse(
    'nombre,telefono\nSECRET_NAME,+12025550123\n"unfinished,+12025550124',
  );
  assert.equal(result.fileErrors[0].code, 'CSV_SYNTAX');
  assert.equal(result.rows.length, 0);
  assert.equal(JSON.stringify(result).includes('SECRET_NAME'), false);
  assert.equal(JSON.stringify(result).includes('12025550123'), false);
  assert.equal(
    parseContactsCsv(Buffer.from([0xff, 0xfe, 0x61])).fileErrors[0].code,
    'INVALID_UTF8',
  );
});

test('empty files, headers without contacts, huge records and bounded row counts are explicit file errors', () => {
  assert.equal(parse('').fileErrors[0].code, 'EMPTY_CSV');
  assert.equal(parse('nombre,telefono\n').fileErrors[0].code, 'NO_CONTACTS');
  assert.equal(
    parse(`nombre,telefono\n${'A'.repeat(20000)},+12025550123`).fileErrors[0]
      .code,
    'RECORD_TOO_LARGE',
  );
  assert.equal(
    parseContactsCsv(Buffer.alloc(MAX_CSV_BYTES + 1)).fileErrors[0].code,
    'FILE_TOO_LARGE',
  );
  const rows = Array.from(
    { length: MAX_CONTACTS },
    (_, index) => `Contact ${index},`,
  ).join('\n');
  assert.equal(parse('nombre,telefono\n' + rows).totalRows, MAX_CONTACTS);
  assert.equal(
    parse('nombre,telefono\n' + rows + '\nExtra,').fileErrors[0].code,
    'TOO_MANY_CONTACTS',
  );
});

test('import cancellation preserves contacts; failures replace stale contacts; clearing does not modify or copy the CSV', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wa-contacts-test-'));
  try {
    const file = path.join(root, 'test.csv');
    const original = 'nombre,telefono\nAna,+12025550123';
    await writeFile(file, original);
    let selected = file;
    const service = new ContactsService({
      selectFile: async () => selected,
      parseBytes: async (bytes) => parseContactsCsv(bytes),
    });
    assert.equal((await service.selectCsv()).validCount, 1);
    assert.equal(service.snapshot().busy, false);
    assert.equal(service.snapshot().fileName, 'test.csv');
    assert.equal(JSON.stringify(service.snapshot()).includes(root), false);
    selected = null;
    assert.equal((await service.selectCsv()).cancelled, true);
    assert.equal(service.snapshot().validCount, 1);
    selected = path.join(root, 'missing.csv');
    assert.equal((await service.selectCsv()).status, 'invalid-file');
    assert.equal(service.snapshot().rows.length, 0);
    assert.equal(
      JSON.stringify(service.snapshot().fileErrors).includes(root),
      false,
    );
    service.clear();
    assert.equal(service.snapshot().fileName, null);
    assert.equal(await readFile(file, 'utf8'), original);
    assert.deepEqual(await readdir(root), ['test.csv']);
    const fresh = new ContactsService({
      selectFile: async () => file,
      parseBytes: parseContactsCsv,
    });
    assert.equal(fresh.snapshot().totalRows, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('import rejects oversized and non-CSV files without parsing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wa-contacts-limit-'));
  try {
    let selected = path.join(root, 'large.csv');
    await writeFile(selected, Buffer.alloc(MAX_CSV_BYTES + 1));
    const service = new ContactsService({
      selectFile: async () => selected,
      parseBytes: () => assert.fail('Must not parse rejected files'),
    });
    assert.equal((await service.selectCsv()).status, 'invalid-file');
    selected = path.join(root, 'wrong.txt');
    assert.equal((await service.selectCsv()).status, 'invalid-file');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a pending import blocks duplicate dialogs and clearing until validation finishes', async () => {
  let start;
  let release;
  const started = new Promise((resolve) => {
    start = resolve;
  });
  const service = new ContactsService({
    selectFile: async () =>
      path.resolve(__dirname, '../fixtures/contacts/valid.csv'),
    parseBytes: (bytes) =>
      new Promise((resolve) => {
        release = () => resolve(parseContactsCsv(bytes));
        start();
      }),
  });
  const pending = service.selectCsv();
  await started;
  await assert.rejects(service.selectCsv(), /importación.*curso/);
  assert.throws(() => service.clear(), /termine la importación/);
  release();
  assert.equal((await pending).validCount, 3);
  assert.equal(service.snapshot().busy, false);
});
