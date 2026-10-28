'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { translate, english } = require('../../src/renderer/translations.js');
const {
  LanguagePreference,
  validateLanguage,
} = require('../../src/services/language-preference.cjs');
const { localizeDialog } = require('../../src/shared/native-dialog.cjs');
const {
  parseContactsCsv,
} = require('../../src/services/contacts/parse-csv.cjs');
const { SendFailure } = require('../../src/domain/send-failure.cjs');
const { CompressionError } = require('../../src/domain/compression.cjs');

test('catalog preserves interpolation fields, handles repeated values and never interprets user text', () => {
  for (const [source, target] of Object.entries(english)) {
    const fields = (text) =>
      [...text.matchAll(/\{\d+\}/gu)].map((match) => match[0]).sort();
    assert.deepEqual(fields(source), fields(target), source);
    assert.ok(target.trim());
    assert.equal(translate('es', source), source);
  }
  const name = '<img src=x onerror=alert(1)> ${name} {0} Enviado';
  assert.equal(translate('en', 'Archivo: {0}', name), `File: ${name}`);
  assert.equal(translate('es', 'Archivo: {0}', name), `Archivo: ${name}`);
  assert.equal(translate('en', 'Unknown message'), 'Unknown message');
});

test('CSV validation and operational diagnostics have English messages, including appended safe codes', () => {
  const csv = parseContactsCsv(Buffer.from('nombre,telefono\nAna,no-number\n'));
  for (const error of csv.rows[0].errors) {
    assert.notEqual(translate('en', error.message), error.message);
  }
  const send = new SendFailure({ code: 'NO_MESSAGE_ID' });
  assert.match(translate('en', send.message), /message identifier/);
  assert.match(
    translate('en', new CompressionError('CHANGED').message),
    /files changed/,
  );
  assert.equal(
    translate(
      'en',
      'Resultado incierto. Revisa el chat antes de repetir; no hay reintentos automáticos. Código: NO_MESSAGE_ID.',
    ),
    'Uncertain result. Check the chat before repeating; there are no automatic retries. Code: NO_MESSAGE_ID.',
  );
});

test('native dialog localization preserves paths, extensions, options and confirmation defaults', () => {
  const dialog = {
    title: 'Guardar plantilla de contactos',
    message: '¿Desvincular y eliminar la sesión local?',
    buttons: ['Cancelar', 'Desvincular'],
    defaultPath: '/private/Enviado/nombre,telefono.csv',
    filters: [{ name: 'Contactos CSV', extensions: ['csv'] }],
    defaultId: 0,
    cancelId: 0,
  };
  const localized = localizeDialog('en', dialog);
  assert.equal(localized.title, 'Save contacts template');
  assert.deepEqual(localized.buttons, ['Cancel', 'Unlink']);
  assert.equal(localized.defaultPath, dialog.defaultPath);
  assert.deepEqual(localized.filters[0].extensions, ['csv']);
  assert.equal(localized.defaultId, 0);
  assert.equal(localized.cancelId, 0);
  assert.equal(dialog.buttons[0], 'Cancelar');
});

test('only explicit supported language codes are accepted at the IPC boundary', () => {
  for (const code of ['es', 'en']) validateLanguage([code]);
  for (const args of [
    [],
    ['fr'],
    ['EN'],
    [null],
    [{}],
    ['en', 'es'],
    [{ language: 'en', path: '/etc/passwd' }],
  ]) {
    assert.throws(() => validateLanguage(args), /Idioma no válido/);
  }
});

test('language preference survives a fresh instance; missing, malformed and unsupported settings fall back safely', async () => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'wa-language-'));
  const file = path.join(root, 'preferences.json');
  try {
    const settings = new LanguagePreference(file);
    assert.equal(await settings.load(), 'es');
    await settings.save('en');
    assert.equal(await new LanguagePreference(file).load(), 'en');
    await settings.save('es');
    assert.equal(await new LanguagePreference(file).load(), 'es');
    for (const value of ['{', 'null', '{"language":"fr"}', '{"other":true}']) {
      await fs.writeFile(file, value);
      assert.equal(await new LanguagePreference(file).load(), 'es');
    }
    assert.deepEqual(await fs.readdir(root), ['preferences.json']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('failed preference writes leave the active language unchanged and concurrent saves cannot race', async () => {
  let finish;
  const settings = new LanguagePreference('/fake/settings.json', {
    writeFile: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    rename: async () => {
      throw new Error('/private/SECRET');
    },
    rm: async () => {},
  });
  const saving = settings.save('en');
  await assert.rejects(settings.save('en'), /cambio de idioma/);
  finish();
  await assert.rejects(
    saving,
    (error) =>
      error.message.includes('No se pudo guardar el idioma') &&
      !error.message.includes('SECRET'),
  );
  assert.equal(settings.language, 'es');
  assert.equal(settings.busy, false);
});
