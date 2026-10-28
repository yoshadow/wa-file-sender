'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { SendFailure } = require('../../src/domain/send-failure.cjs');

async function run({
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
}) {
  assert.equal(adapter.config.mock, true);
  assert.equal(
    await ui('document.getElementById("session-indicator").dataset.state'),
    'disconnected',
  );
  assert.equal(
    await ui(
      'document.getElementById("import-csv-button").nextElementSibling.id',
    ),
    'clear-csv-button',
  );
  const get = async () => (await ui('window.waFileSender.getQueue()')).state;
  assert.equal((await get()).mode, 'whatsapp');
  const absent = await ui(
    `['queue-mode','queue-outcome','zip-recipient','generate-zip-button','send-test-button','session-results'].every((id) => document.getElementById(id) === null)`,
  );
  assert.equal(absent, true);
  assert.equal(
    await ui(
      '/simulaci[oó]n|\\blog(?:s)?\\b|ZIP local|ETAPA 7/iu.test(document.body.innerText)',
    ),
    false,
  );
  assert.equal(
    await ui(
      'document.getElementById("connect-button").closest("aside") !== null',
    ),
    true,
  );
  assert.equal(
    await ui('document.getElementById("prepare-queue-button").disabled'),
    true,
  );
  const root = path.join(app.getPath('userData'), 'Compresion ficticia');
  await fs.mkdir(path.join(root, 'Ana Pérez'), { recursive: true });
  await fs.mkdir(path.join(root, 'López, Bruno'));
  await fs.writeFile(
    path.join(root, 'Ana Pérez', 'Prueba.txt'),
    'Texto ficticio de Ana',
  );
  await fs.writeFile(
    path.join(root, 'López, Bruno', 'Otro.txt'),
    'Texto ficticio de Bruno',
  );
  const csv = path.join(app.getPath('userData'), 'contactos-sin-signo.csv');
  const originalCsv = (
    await fs.readFile(
      path.join(app.getAppPath(), 'tests/fixtures/contacts/valid.csv'),
      'utf8',
    )
  ).replace(/\+/gu, '');
  await fs.writeFile(csv, originalCsv);
  testCsvSelections.push(csv);
  await ui('document.getElementById("import-csv-button").click()');
  await waitUntil(() =>
    ui('!document.getElementById("select-root-button").disabled'),
  );
  const contacts = (await ui('window.waFileSender.getContacts()')).state;
  assert.equal(contacts.validCount, 3);
  assert.ok(
    contacts.rows.every(
      (row) =>
        !row.phone.startsWith('+') && row.normalizedPhone.startsWith('+'),
    ),
  );
  assert.equal(await fs.readFile(csv, 'utf8'), originalCsv);
  testDirectorySelections.push(root);
  await ui('document.getElementById("select-root-button").click()');
  await waitUntil(
    async () =>
      (await ui('window.waFileSender.getPreview()')).state.status === 'ready',
  );
  let preview = (await ui('window.waFileSender.getPreview()')).state;
  for (const name of ['Ana Pérez', 'López, Bruno']) {
    const row = preview.rows.find((item) => item.contactName === name);
    await ui(
      `document.querySelector('[data-selection-id="${row.id}"]').click()`,
    );
    await waitUntil(() =>
      ui('!document.getElementById("select-root-button").disabled'),
    );
  }
  const ana = preview.rows.find((item) => item.contactName === 'Ana Pérez');
  await ui(
    `document.querySelector('[data-recipient-id="${ana.id}"] summary').click()`,
  );
  assert.equal(
    await ui(
      `document.querySelector('[data-recipient-id="${ana.id}"] details').open`,
    ),
    true,
  );
  const badMode = await ui(
    `window.waFileSender.prepareQueue({revision: ${JSON.stringify((await ui('window.waFileSender.getPreview()')).state.revision)}, intervalSeconds: 10, mode: 'simulation', outcome: 'success'})`,
  );
  assert.equal(badMode.ok, false);
  await ui(
    'document.getElementById("contacts-details").open = false; document.getElementById("connect-button").click()',
  );
  await waitUntil(() => adapter.state.status === 'qr');
  await ui('refresh()');
  await waitUntil(() =>
    ui(
      'document.getElementById("session-indicator").dataset.state === "connecting"',
    ),
  );
  assert.equal(
    testConfirmations.some((item) => item.kind === 'connect'),
    false,
  );
  await ui('refresh()');
  await waitUntil(() =>
    ui('document.getElementById("qr-image").naturalWidth > 0'),
  );
  if (process.argv.includes('--capture-preview')) {
    mainWindow.show();
    await delay(150);
    await fs.writeFile(
      path.join(app.getPath('userData'), 'sidebar-preview.png'),
      (await mainWindow.webContents.capturePage()).toPNG(),
    );
    mainWindow.hide();
  }
  await waitUntil(() => adapter.state.status === 'ready');
  await ui('refresh()');
  await waitUntil(() =>
    ui(
      'document.getElementById("session-indicator").dataset.state === "connected"',
    ),
  );
  assert.equal(
    await ui(
      'document.getElementById("session-detail").textContent.includes("automáticamente")',
    ),
    false,
  );
  const browser = await adapter.request('verify-browser');
  assert.equal(browser.noNode, true);
  assert.equal(browser.sandboxEnabled, true);
  await waitUntil(() =>
    ui('!document.getElementById("prepare-queue-button").disabled'),
  );
  await ui(
    'document.getElementById("queue-interval").value = 9; document.getElementById("queue-interval").dispatchEvent(new Event("input"))',
  );
  assert.equal(
    await ui('document.getElementById("prepare-queue-button").disabled'),
    true,
  );
  await ui(
    'document.getElementById("queue-interval").value = 10; document.getElementById("queue-interval").dispatchEvent(new Event("input"))',
  );
  const caption = 'Hola, aquí están tus archivos.\nGracias.';
  const captions = [];
  const sendDocument = adapter.sendDocument.bind(adapter);
  adapter.sendDocument = (...args) => {
    captions.push(args[3]);
    return sendDocument(...args);
  };
  await ui(
    `document.getElementById('queue-message').value = ${JSON.stringify(caption)}; document.getElementById('queue-message').dispatchEvent(new Event('input'))`,
  );
  const review = async () => {
    await waitUntil(() =>
      ui('!document.getElementById("prepare-queue-button").disabled'),
    );
    await ui('document.getElementById("prepare-queue-button").click()');
    await waitUntil(() =>
      ui('document.getElementById("send-review-dialog").open'),
    );
  };
  await review();
  await require('./language-smoke.cjs').review({
    app,
    ui,
    waitUntil,
    mainWindow,
  });
  assert.equal(
    await ui('document.getElementById("queue-review-message").textContent'),
    caption,
  );
  assert.equal(batchHistory.page(0).total, 0);
  assert.equal(
    (await fs.readdir(root)).some((name) => name.endsWith('.log')),
    false,
  );
  assert.equal(
    await ui(
      'document.getElementById("queue-review-items").textContent.includes("+12025550123")',
    ),
    true,
  );
  await ui('document.getElementById("cancel-review-button").click()');
  assert.equal(
    await ui('document.getElementById("send-review-dialog").open'),
    false,
  );
  await ui(
    `document.getElementById('queue-message').value = ${JSON.stringify(caption + '!')}; document.getElementById('queue-message').dispatchEvent(new Event('input'))`,
  );
  assert.equal(
    await ui('document.getElementById("start-queue-button").disabled'),
    true,
  );
  await ui(
    `document.getElementById('queue-message').value = ${JSON.stringify(caption)}; document.getElementById('queue-message').dispatchEvent(new Event('input'))`,
  );
  await review();
  const { changeLanguage } = require('./language-smoke.cjs');
  await changeLanguage(ui, waitUntil, 'en');
  await ui('document.getElementById("start-queue-button").click()');
  await waitUntil(async () => (await get()).status === 'completed');
  await waitUntil(() =>
    ui(
      'document.querySelectorAll(".recipient-status").length > 0 && [...document.querySelectorAll(".recipient-status")].filter(node => node.textContent === "Sent").length === 2',
    ),
  );
  assert.equal(
    await ui('document.getElementById("completion-status").textContent.trim()'),
    'Sending completed',
  );
  await changeLanguage(ui, waitUntil, 'es');
  assert.equal(batchHistory.page(0).total, 2);
  assert.deepEqual(captions, [caption, caption]);
  const logs = await Promise.all(
    (await fs.readdir(root))
      .filter((name) => name.endsWith('.log'))
      .map((name) => fs.readFile(path.join(root, name), 'utf8')),
  );
  assert.equal(logs.length, 1);
  assert.ok(
    logs.every(
      (content) => JSON.parse(content.split('\n')[0]).mensaje === caption,
    ),
  );
  assert.ok(
    batchHistory
      .page(0)
      .rows.every(
        (item) =>
          item.mode === 'whatsapp' &&
          item.messageId === 'SIMULATED-DOCUMENT-NOT-SENT',
      ),
  );
  assert.ok(
    batchHistory.page(0).rows[0].startedAt -
      batchHistory.page(0).rows[1].finishedAt >=
      10000,
  );
  await waitUntil(() =>
    ui(
      'Array.from(document.querySelectorAll(".recipient-status")).filter((node) => node.textContent === "Enviado").length === 2',
    ),
  );
  assert.equal(
    testConfirmations.some((item) => item.kind === 'queue-start'),
    false,
  );
  assert.deepEqual(await fs.readdir(adapter.config.documentRoot), []);
  await waitUntil(() =>
    ui('!document.getElementById("completion-status").hidden'),
  );
  assert.equal(
    await ui(
      'document.getElementById("prepare-queue-button").nextElementSibling.id',
    ),
    'completion-status',
  );
  if (!(await ui('matchMedia("(prefers-reduced-motion: reduce)").matches')))
    assert.equal(
      await ui(
        'getComputedStyle(document.getElementById("completion-status")).animationIterationCount',
      ),
      '2',
    );
  await waitUntil(() =>
    ui('document.getElementById("prepare-queue-button").disabled'),
  );
  for (const row of (
    await ui('window.waFileSender.getPreview()')
  ).state.rows.filter((row) =>
    ['Ana Pérez', 'López, Bruno'].includes(row.contactName),
  )) {
    assert.equal(row.selected, false);
    assert.equal(
      await ui(
        `document.querySelector('[data-selection-id="${row.id}"]').disabled`,
      ),
      false,
    );
    assert.equal(
      await ui(
        `document.querySelector('[data-selection-id="${row.id}"]').checked`,
      ),
      false,
    );
  }

  if (process.argv.includes('--capture-preview')) {
    mainWindow.show();
    await delay(150);
    await fs.writeFile(
      path.join(app.getPath('userData'), 'preview.png'),
      (await mainWindow.webContents.capturePage()).toPNG(),
    );
    mainWindow.setSize(800, 650);
    await delay(150);
    assert.equal(
      await ui('document.documentElement.scrollWidth <= innerWidth'),
      true,
    );
    await fs.writeFile(
      path.join(app.getPath('userData'), 'small-preview.png'),
      (await mainWindow.webContents.capturePage()).toPNG(),
    );
    mainWindow.hide();
  }
  const afterSend = (await ui('window.waFileSender.getPreview()')).state;
  const blocked = await ui(
    `window.waFileSender.prepareQueue({ revision: ${JSON.stringify(afterSend.revision)}, intervalSeconds: 10, outcome: 'success', mode: 'whatsapp' })`,
  );
  assert.equal(blocked.state.status, 'failed');
  assert.equal(batchHistory.page(0).total, 2);
  // A deliberate re-selection survives background refresh and can be sent again.
  await waitUntil(() =>
    ui(`!document.querySelector('[data-selection-id="${ana.id}"]').disabled`),
  );
  await ui(`document.querySelector('[data-selection-id="${ana.id}"]').click()`);
  await waitUntil(
    async () =>
      (await ui('window.waFileSender.getPreview()')).state.selectedCount === 1,
  );
  await delay(700);
  assert.equal(
    (await ui('window.waFileSender.getPreview()')).state.selectedCount,
    1,
  );
  await review();
  assert.equal(queue.review.items[0].risks.exact, true);
  await ui('document.getElementById("start-queue-button").click()');
  await waitUntil(async () => (await get()).status === 'completed');
  assert.equal(batchHistory.page(0).total, 3);
  await waitUntil(
    async () =>
      (await ui('window.waFileSender.getPreview()')).state.selectedCount === 0,
  );
  await waitUntil(() =>
    ui(`!document.querySelector('[data-selection-id="${ana.id}"]').disabled`),
  );
  // Reset only the fictitious in-memory records to exercise stop and failure paths
  // with the same fixtures; no reset control exists in the production interface.
  batchHistory.clear();
  const selectPending = async () => {
    const selection = (await ui('window.waFileSender.getPreview()')).state;
    await waitUntil(() =>
      ui('!document.getElementById("select-root-button").disabled'),
    );
    for (const row of selection.rows.filter(
      (row) => row.eligible && !row.selected,
    )) {
      await waitUntil(() =>
        ui(
          `!document.querySelector('[data-selection-id="${row.id}"]').disabled`,
        ),
      );
      await ui(
        `document.querySelector('[data-selection-id="${row.id}"]').click()`,
      );
      await waitUntil(() =>
        ui('!document.getElementById("select-root-button").disabled'),
      );
    }
  };
  await selectPending();
  let entered;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const wait = queue.clock.wait;
  queue.clock.wait = (ms, signal) => {
    if (queue.completed !== 1) return wait(ms, signal);
    entered();
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('Stopped')), {
        once: true,
      }),
    );
  };
  await review();
  await ui('document.getElementById("start-queue-button").click()');
  await waiting;
  await waitUntil(() =>
    ui('!document.getElementById("stop-queue-button").disabled'),
  );
  assert.equal(
    await ui('document.getElementById("import-csv-button").disabled'),
    true,
  );
  await waitUntil(() =>
    ui(
      'Array.from(document.querySelectorAll(".recipient-countdown")).some((node) => !node.hidden && node.textContent.includes("s"))',
    ),
  );
  assert.equal(
    await ui('document.getElementById("queue-countdown") === null'),
    true,
  );
  const beforeStop = batchHistory.page(0).total;
  await ui('document.getElementById("stop-queue-button").click()');
  await waitUntil(async () => !(await get()).busy);
  assert.equal((await get()).status, 'stopped');
  assert.equal(batchHistory.page(0).total, beforeStop);
  queue.clock.wait = wait;
  await selectPending();
  // Internal mocks exercise an ambiguous real-mode failure; production UI has no scenario selector.
  const send = adapter.sendDocument;
  adapter.sendDocument = async () => {
    throw new SendFailure({ code: 'TIMEOUT', mayHaveSent: true });
  };
  await review();
  await ui('document.getElementById("start-queue-button").click()');
  await waitUntil(async () => (await get()).status === 'uncertain');
  await waitUntil(() =>
    ui(
      'document.querySelector(".recipient-status[data-state=uncertain]") !== null',
    ),
  );
  adapter.sendDocument = send;
  const uncertainPhone = batchHistory.page(0).rows[0].phone;
  const uncertainRow = (
    await ui('window.waFileSender.getPreview()')
  ).state.rows.find((row) => row.phone === uncertainPhone);
  await ui(
    `document.querySelector('[data-recipient-id="${uncertainRow.id}"] details').open = true`,
  );
  await ui('refresh()');
  await waitUntil(() =>
    ui(
      'document.getElementById("session-indicator").dataset.state === "disconnected"',
    ),
  );
  await changeLanguage(ui, waitUntil, 'en');
  assert.ok(
    (await ui('document.getElementById("queue-status").textContent')).includes(
      'Uncertain result.',
    ),
  );
  assert.equal(
    await ui(
      '[...document.querySelectorAll(".recipient-status")].some(node => node.textContent === "Uncertain result")',
    ),
    true,
  );
  assert.equal(
    await ui(
      '[...document.querySelectorAll(".attempt-details button")].some(node => node.textContent === "It was not sent")',
    ),
    true,
  );
  await changeLanguage(ui, waitUntil, 'es');
  await ui(
    `Array.from(document.querySelectorAll('.attempt-details button')).find((node) => node.textContent === 'No se envió').click()`,
  );
  await waitUntil(() => batchHistory.page(0).rows[0].resolution === 'not-sent');
  assert.equal(
    await ui('/simulaci[oó]n|\\blog(?:s)?\\b/iu.test(document.body.innerText)'),
    false,
  );
}
module.exports = { run };
