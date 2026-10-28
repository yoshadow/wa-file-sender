'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  APP_URL,
  resolveResource,
  handleTrustedRequest,
} = require('../../src/shared/security.cjs');

function fixture() {
  const mainFrame = { url: APP_URL };
  const window = {
    isDestroyed: () => false,
    webContents: { mainFrame },
  };
  const event = { sender: window.webContents, senderFrame: mainFrame };
  let calls = 0;
  const handle = handleTrustedRequest(
    () => window,
    () => ++calls,
  );
  return { window, event, handle, calls: () => calls };
}

test('only packaged UI assets can be resolved', () => {
  for (const file of [
    'index.html',
    'styles.css',
    'icon.png',
    'translations.js',
    'i18n.js',
    'app.js',
    'preview.js',
    'queue.js',
  ]) {
    assert.equal(resolveResource(`app://ui/${file}`).name, file);
  }
});

test('rejects remote URLs, arbitrary files, credentials, traversal and URL variants', () => {
  for (const url of [
    'https://ui/index.html',
    'file:///etc/passwd',
    'app://other/index.html',
    'app://ui:123/index.html',
    'app://user@ui/index.html',
    'app://ui/../../index.html',
    'app://ui/%2e%2e/index.html',
    'app://ui/%69ndex.html',
    'app://ui/index.html?path=/etc/passwd',
    'app://ui/index.html#frame',
    'app://ui/package.json',
    'app://ui/zip.js',
    'app://ui/../preload/index.cjs',
    'app://ui/__proto__',
    'not a url',
  ])
    assert.equal(resolveResource(url), null, url);
});

test('allows the registered operation from the exact main frame', () => {
  const { event, handle, calls } = fixture();
  assert.equal(handle(event), 1);
  assert.equal(calls(), 1);
});

test('rejects all arguments before invoking the operation', () => {
  const { event, handle, calls } = fixture();
  for (const args of [[{}], [undefined], [null], ['path'], [1, 2]]) {
    assert.throws(() => handle(event, ...args), /no acepta argumentos/);
  }
  assert.equal(calls(), 0);
});

test('rejects a different window even when it loads the same URL', () => {
  const { event, handle, calls } = fixture();
  assert.throws(() => handle({ ...event, sender: {} }), /no autorizada/);
  assert.equal(calls(), 0);
});

test('rejects subframes and missing frames', () => {
  const { event, handle, calls } = fixture();
  for (const senderFrame of [null, { url: APP_URL }]) {
    assert.throws(() => handle({ ...event, senderFrame }), /no autorizada/);
  }
  assert.equal(calls(), 0);
});

test('rejects navigation away from the exact trusted document', () => {
  for (const url of [
    'https://example.com',
    'app://ui/index.html?x=1',
    'about:blank',
  ]) {
    const { event, handle, calls } = fixture();
    event.senderFrame.url = url;
    assert.throws(() => handle(event), /no autorizada/);
    assert.equal(calls(), 0);
  }
});

test('rejects closed and absent windows', () => {
  const { window, event, handle, calls } = fixture();
  window.isDestroyed = () => true;
  assert.throws(() => handle(event), /no autorizada/);
  assert.equal(calls(), 0);
  const noWindow = handleTrustedRequest(
    () => null,
    () => assert.fail(),
  );
  assert.throws(() => noWindow(event), /no autorizada/);
});
