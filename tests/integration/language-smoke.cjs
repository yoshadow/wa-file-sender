'use strict';
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { readFile, writeFile } = require('node:fs/promises');
const path = require('node:path');

async function changeLanguage(ui, waitUntil, language) {
  await ui(
    `document.getElementById('language-select').value = '${language}'; document.getElementById('language-select').dispatchEvent(new Event('change'))`,
  );
  await waitUntil(() =>
    ui(
      `document.documentElement.lang === '${language}' && !document.getElementById('language-select').disabled`,
    ),
  );
}

async function run({
  app,
  mainWindow,
  ui,
  waitUntil,
  waitForUi,
  testTemplateSelections,
}) {
  const before = (await ui('window.waFileSender.getContacts()')).state;
  const selector = await ui(`({
    checked: [...document.querySelectorAll('[data-selection-id]')].map(input => [input.dataset.selectionId, input.checked]),
    message: document.getElementById('queue-message').value,
  })`);
  await changeLanguage(ui, waitUntil, 'en');
  assert.equal(
    await ui('document.querySelector("h1").textContent.trim()'),
    'Send files',
  );
  assert.equal(
    await ui('document.getElementById("session-label").textContent'),
    'WhatsApp not linked',
  );
  assert.equal(
    await ui('document.getElementById("queue-message").placeholder'),
    'Write the message to send with the files…',
  );
  assert.equal(
    await ui('document.getElementById("qr-image").alt'),
    'QR code to link WhatsApp',
  );
  assert.equal(
    await ui(
      'document.querySelector(".recipient-scroll").getAttribute("aria-label")',
    ),
    'Recipients and files',
  );
  assert.equal((await ui('window.waFileSender.getAppInfo()')).language, 'en');
  await waitUntil(() =>
    ui(
      'document.getElementById("queue-account").textContent === "Link WhatsApp in the left sidebar to continue."',
    ),
  );
  assert.deepEqual(
    (await ui('window.waFileSender.getContacts()')).state,
    before,
  );
  assert.deepEqual(
    await ui(`({
    checked: [...document.querySelectorAll('[data-selection-id]')].map(input => [input.dataset.selectionId, input.checked]),
    message: document.getElementById('queue-message').value,
  })`),
    selector,
  );
  const settingsFile = path.join(app.getPath('userData'), 'preferences.json');
  assert.deepEqual(JSON.parse(await readFile(settingsFile, 'utf8')), {
    language: 'en',
  });
  for (const args of [
    'undefined',
    '"fr"',
    '{language: "en", path: "/etc/passwd"}',
    '"en", "es"',
  ]) {
    assert.equal(
      await ui(
        `window.waFileSender.setLanguage(${args}).then(() => false, () => true)`,
      ),
      true,
    );
  }
  assert.equal((await ui('window.waFileSender.getAppInfo()')).language, 'en');
  assert.ok(
    (await ui('document.getElementById("contacts-rows").textContent')).includes(
      'Invalid phone:',
    ),
  );
  // Reload recreates every renderer script and must restore the main process preference.
  await new Promise((resolve) => {
    mainWindow.webContents.once('did-finish-load', resolve);
    mainWindow.webContents.reload();
  });
  await waitForUi(mainWindow.webContents);
  assert.equal(await ui('document.documentElement.lang'), 'en');
  assert.equal(
    await ui('document.getElementById("language-select").value'),
    'en',
  );
  assert.equal(
    await ui('document.getElementById("session-label").textContent'),
    'WhatsApp not linked',
  );
  const template = path.join(app.getPath('userData'), 'English-template.csv');
  testTemplateSelections.push(template);
  await ui('document.getElementById("download-template-button").click()');
  await waitUntil(() =>
    ui(
      'document.getElementById("template-status").textContent === "Template saved."',
    ),
  );
  assert.equal(await readFile(template, 'utf8'), '\uFEFFnombre,telefono\r\n');
  await changeLanguage(ui, waitUntil, 'es');
  assert.equal(
    await ui('document.getElementById("template-status").textContent'),
    'Plantilla guardada.',
  );
  assert.equal(
    await ui('document.querySelector("h1").textContent.trim()'),
    'Enviar archivos',
  );
  assert.equal(
    await ui('document.getElementById("session-label").textContent'),
    'WhatsApp sin vincular',
  );
}

async function review({ app, ui, waitUntil, mainWindow }) {
  const before = await ui('window.waFileSender.getPreview()');
  const approved = await ui('window.waFileSender.getQueue()');
  const caption = await ui('document.getElementById("queue-message").value');
  const names = await ui(
    '[...document.querySelectorAll(".review-recipient h3")].map(node => node.textContent)',
  );
  await changeLanguage(ui, waitUntil, 'en');
  assert.equal(
    await ui('document.getElementById("send-review-dialog").open'),
    true,
  );
  assert.equal(
    await ui(
      'document.getElementById("start-queue-button").textContent.trim()',
    ),
    'Confirm and send',
  );
  assert.equal(
    await ui('document.getElementById("queue-review-message").textContent'),
    caption,
  );
  assert.deepEqual(
    await ui(
      '[...document.querySelectorAll(".review-recipient h3")].map(node => node.textContent)',
    ),
    names,
  );
  assert.deepEqual(await ui('window.waFileSender.getPreview()'), before);
  assert.equal(
    (await ui('window.waFileSender.getQueue()')).state.review.id,
    approved.state.review.id,
  );
  assert.ok(
    (
      await ui('document.getElementById("queue-review-summary").textContent')
    ).includes('Pause: 10 seconds'),
  );
  assert.equal(
    await ui('document.querySelector(".recipient-status").textContent'),
    'Pending',
  );
  if (process.argv.includes('--capture-preview')) {
    mainWindow.show();
    await delay(300);
    await writeFile(
      path.join(app.getPath('userData'), 'english-preview.png'),
      (await mainWindow.webContents.capturePage()).toPNG(),
    );
    mainWindow.hide();
  }
  await changeLanguage(ui, waitUntil, 'es');
  assert.equal(
    await ui('document.getElementById("send-review-dialog").open'),
    true,
  );
  assert.equal(
    await ui(
      'document.getElementById("start-queue-button").textContent.trim()',
    ),
    'Confirmar y enviar',
  );
}
module.exports = { run, review, changeLanguage };
