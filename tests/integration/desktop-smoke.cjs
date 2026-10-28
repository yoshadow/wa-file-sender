'use strict';

const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { writeFile, readFile } = require('node:fs/promises');
const path = require('node:path');

async function waitForUi(contents) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await contents.executeJavaScript(
      'document.documentElement.dataset.ready',
    );
    if (state === 'true') return;
    if (state === 'error')
      throw new Error('La interfaz no pudo inicializarse.');
    await delay(50);
  }
  throw new Error('La interfaz no respondió a tiempo.');
}

async function waitUntil(check) {
  for (let i = 0; i < 120; i++) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error('La operación simulada no terminó.');
}

async function run({
  app,
  mainWindow,
  createWindow,
  APP_URL,
  adapter,
  testConfirmations,
  testCsvSelections,
  testTemplateSelections,
  testDirectorySelections,
  queue,
  batchHistory,
}) {
  try {
    await waitForUi(mainWindow.webContents);
    const info = await mainWindow.webContents.executeJavaScript(
      'window.waFileSender.getAppInfo()',
    );
    assert.equal(Object.hasOwn(info, 'stage'), false);
    assert.equal(info.simulated, true);
    assert.equal(info.name, 'WA File Sender');
    const exposure = await mainWindow.webContents.executeJavaScript(`({
      require: typeof window.require,
      process: typeof window.process,
      bridge: Object.keys(window.waFileSender).sort(),
      stylesLoaded: getComputedStyle(document.querySelector('.app-shell')).display,
    })`);
    assert.equal(exposure.require, 'undefined');
    assert.equal(exposure.process, 'undefined');
    assert.deepEqual(exposure.bridge, [
      'clearContacts',
      'clearPreview',
      'close',
      'connectWhatsApp',
      'getAppInfo',
      'getContacts',
      'getPreview',
      'getQueue',
      'getSessionResults',
      'getWhatsAppState',
      'prepareQueue',
      'resolveBatchAttempt',
      'saveContactsTemplate',
      'selectContactsCsv',
      'selectPreviewItem',
      'selectRoot',
      'setLanguage',
      'startQueue',
      'stopQueue',
      'unlinkWhatsApp',
    ]);
    assert.equal(exposure.stylesLoaded, 'grid');
    assert.equal(
      await mainWindow.webContents.executeJavaScript(
        'document.querySelector(".brand-mark").naturalWidth',
      ),
      512,
    );

    const preferences = mainWindow.webContents.getLastWebPreferences();
    assert.equal(preferences.nodeIntegration, false);
    assert.equal(preferences.contextIsolation, true);
    assert.equal(preferences.sandbox, true);
    assert.equal(preferences.webSecurity, true);

    for (const method of [
      'getAppInfo',
      'close',
      'getWhatsAppState',
      'connectWhatsApp',
      'unlinkWhatsApp',
      'getPreview',
      'selectRoot',
      'clearPreview',
      'getQueue',
      'getSessionResults',
      'stopQueue',
      'saveContactsTemplate',
    ]) {
      const rejected = await mainWindow.webContents.executeJavaScript(`
        window.waFileSender.${method}({unexpected: true})
          .then(() => false, () => true)
      `);
      assert.equal(rejected, true);
      assert.equal(mainWindow.isDestroyed(), false);
    }

    const cspBlocked = await mainWindow.webContents
      .executeJavaScript(`new Promise((resolve) => {
      const script = document.createElement('script');
      script.textContent = 'window.untrustedInlineCode = true';
      document.body.appendChild(script);
      setTimeout(() => resolve(window.untrustedInlineCode !== true), 50);
    })`);
    assert.equal(cspBlocked, true);

    const popup = await mainWindow.webContents.executeJavaScript(
      `window.open('app://ui/index.html') === null`,
    );
    assert.equal(popup, true);

    const foreignWindow = createWindow();
    await foreignWindow.loadURL(APP_URL);
    const foreignRejected = await foreignWindow.webContents.executeJavaScript(`
      window.waFileSender.getAppInfo().then(() => false, () => true)
    `);
    assert.equal(foreignRejected, true);
    for (const expression of [
      'window.waFileSender.setLanguage("en")',
      'window.waFileSender.getWhatsAppState()',
      'window.waFileSender.getContacts()',
      'window.waFileSender.saveContactsTemplate()',
      'window.waFileSender.selectContactsCsv()',
      'window.waFileSender.clearContacts()',
      'window.waFileSender.getPreview()',
      'window.waFileSender.selectRoot()',
      'window.waFileSender.clearPreview()',
      'window.waFileSender.getQueue()',
      'window.waFileSender.getSessionResults()',
      'window.waFileSender.stopQueue()',
      'window.waFileSender.startQueue({id: "x"})',
      'window.waFileSender.prepareQueue({revision: "x", intervalSeconds: 10, outcome: "success"})',
      'window.waFileSender.resolveBatchAttempt({id: "x", resolution: "sent"})',
      'window.waFileSender.selectPreviewItem({id: "x", revision: "x", selected: true})',
    ]) {
      assert.equal(
        await foreignWindow.webContents.executeJavaScript(
          `${expression}.then(() => false, () => true)`,
        ),
        true,
      );
    }
    foreignWindow.destroy();
    for (const method of ['prepareZip', 'getBatchHistory', 'sendTest']) {
      assert.equal(
        await mainWindow.webContents.executeJavaScript(
          `typeof window.waFileSender.${method}`,
        ),
        'undefined',
      );
    }

    for (const method of [
      'getContacts',
      'selectContactsCsv',
      'clearContacts',
    ]) {
      assert.equal(
        await mainWindow.webContents.executeJavaScript(
          `window.waFileSender.${method}({path: '/etc/passwd'}).then(() => false, () => true)`,
        ),
        true,
      );
    }
    const ui = (source) => mainWindow.webContents.executeJavaScript(source);
    testTemplateSelections.push(null);
    await ui('document.getElementById("download-template-button").click()');
    await waitUntil(() =>
      ui('!document.getElementById("download-template-button").disabled'),
    );
    assert.equal(
      await ui('document.getElementById("template-status").textContent'),
      'Guardado cancelado.',
    );
    const templateFile = path.join(
      app.getPath('userData'),
      'Plantilla-contactos.csv',
    );
    testTemplateSelections.push(templateFile);
    await ui('document.getElementById("download-template-button").click()');
    await waitUntil(() =>
      ui(
        'document.getElementById("template-status").textContent.startsWith("Plantilla guardada")',
      ),
    );
    assert.equal(
      await readFile(templateFile, 'utf8'),
      '\uFEFFnombre,telefono\r\n',
    );
    assert.equal(
      (await ui('window.waFileSender.getContacts()')).state.status,
      'empty',
    );
    const importCsv = async (file) => {
      testCsvSelections.push(file);
      await ui('document.getElementById("import-csv-button").click()');
      await waitUntil(() =>
        ui('!document.getElementById("import-csv-button").disabled'),
      );
      return (await ui('window.waFileSender.getContacts()')).state;
    };
    const fixture = (name) =>
      path.join(app.getAppPath(), 'tests/fixtures/contacts', name);
    let contacts = await importCsv(fixture('valid.csv'));
    assert.equal(contacts.validCount, 3);
    assert.equal(
      await ui('document.querySelectorAll("#contacts-rows tr").length'),
      3,
    );
    assert.equal((await importCsv(null)).validCount, 3);
    contacts = await importCsv(fixture('mixed.csv'));
    assert.equal(contacts.validCount, 1);
    assert.equal(contacts.invalidCount, 6);
    await require('./language-smoke.cjs').run({
      app,
      mainWindow,
      ui,
      waitUntil,
      waitForUi,
      testTemplateSelections,
    });
    for (const [filter, count] of [
      ['invalid', 6],
      ['valid', 1],
      ['all', 7],
    ]) {
      await ui(
        `document.getElementById('contacts-filter').value = '${filter}'; document.getElementById('contacts-filter').dispatchEvent(new Event('change'))`,
      );
      assert.equal(
        await ui('document.querySelectorAll("#contacts-rows tr").length'),
        count,
      );
    }
    if (process.argv.includes('--capture-preview')) {
      await ui('document.getElementById("contacts-title").scrollIntoView()');
      await delay(150);
      const screenshot = await mainWindow.webContents.capturePage();
      assert.equal(screenshot.isEmpty(), false);
      await writeFile(
        path.join(app.getPath('userData'), 'preview.png'),
        screenshot.toPNG(),
      );
    }
    contacts = await importCsv(fixture('invalid-header.csv'));
    assert.equal(contacts.rows.length, 0);
    assert.equal(contacts.fileErrors[0].code, 'INVALID_HEADERS');
    const hostileCsv = path.join(app.getPath('userData'), 'literal.csv');
    await writeFile(
      hostileCsv,
      'nombre,telefono\n<img src=x onerror=window.csvInjected=true>,+12025550123\n',
    );
    assert.equal((await importCsv(hostileCsv)).validCount, 1);
    assert.equal(
      await ui('document.querySelectorAll("#contacts-rows img").length'),
      0,
    );
    assert.equal(
      await ui(
        'document.querySelector("#contacts-rows").textContent.includes("<img")',
      ),
      true,
    );
    assert.equal(await ui('window.csvInjected === undefined'), true);
    const pagedCsv = path.join(app.getPath('userData'), 'pagination.csv');
    await writeFile(
      pagedCsv,
      'nombre,telefono\n' +
        Array.from(
          { length: 51 },
          (_, index) => `Contacto ${index},+12025550123`,
        ).join('\n'),
    );
    assert.equal((await importCsv(pagedCsv)).totalRows, 51);
    assert.equal(
      await ui('document.querySelectorAll("#contacts-rows tr").length'),
      50,
    );
    await ui('document.getElementById("contacts-next").click()');
    assert.equal(
      await ui('document.querySelectorAll("#contacts-rows tr").length'),
      1,
    );
    await ui('document.getElementById("clear-csv-button").click()');
    await waitUntil(
      async () =>
        (await ui('window.waFileSender.getContacts()')).state.status ===
        'empty',
    );
    assert.equal(adapter.state.status, 'idle');
    assert.equal(testConfirmations.length, 0);
    assert.equal(await ui('document.getElementById("test-phone")'), null);
    assert.equal(await ui('document.getElementById("send-test-button")'), null);
    assert.equal(await ui('document.getElementById("test-history")'), null);
    const closed = new Promise((resolve) => mainWindow.once('closed', resolve));
    await require('./definitive-smoke.cjs').run({
      app,
      mainWindow,
      ui,
      waitUntil,
      adapter,
      queue,
      batchHistory,
      testCsvSelections,
      testDirectorySelections,
      testConfirmations,
    });
    await mainWindow.webContents.executeJavaScript(
      `window.waFileSender.close()`,
    );
    await closed;
    console.log('WA_DESKTOP_SMOKE_OK');
    app.quit();
  } catch (error) {
    console.error('Desktop smoke:', error.stack);
    app.exit(1);
  }
}

module.exports = { run };
