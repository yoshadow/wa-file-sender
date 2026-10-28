'use strict';

const APP_URL = 'app://ui/index.html';
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Deliberately serve only bundled UI assets, never a path supplied by a renderer.
const RESOURCES = Object.freeze({
  '/index.html': { name: 'index.html', type: 'text/html; charset=utf-8' },
  '/icon.png': { name: 'icon.png', type: 'image/png', directory: 'assets' },
  '/styles.css': { name: 'styles.css', type: 'text/css; charset=utf-8' },
  '/translations.js': {
    name: 'translations.js',
    type: 'text/javascript; charset=utf-8',
  },
  '/i18n.js': { name: 'i18n.js', type: 'text/javascript; charset=utf-8' },
  '/app.js': { name: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/preview.js': { name: 'preview.js', type: 'text/javascript; charset=utf-8' },
  '/queue.js': { name: 'queue.js', type: 'text/javascript; charset=utf-8' },
});

function resolveResource(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol !== 'app:' ||
      url.host !== 'ui' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    // Exact matching also rejects encoded names and traversal before URL normalization.
    const resource = RESOURCES[url.pathname];
    return resource && rawUrl === `app://ui${url.pathname}` ? resource : null;
  } catch {
    return null;
  }
}

function assertTrustedSender(event, window) {
  if (
    !window ||
    window.isDestroyed() ||
    event.sender !== window.webContents ||
    !event.senderFrame ||
    event.senderFrame !== window.webContents.mainFrame ||
    event.senderFrame.url !== APP_URL
  ) {
    throw new Error('Solicitud no autorizada.');
  }
}

function assertNoArguments(args) {
  if (args.length !== 0) {
    throw new Error('Esta operación no acepta argumentos.');
  }
}

function handleTrustedRequest(
  getWindow,
  operation,
  validate = assertNoArguments,
) {
  return (event, ...args) => {
    assertTrustedSender(event, getWindow());
    validate(args);
    return operation(...args);
  };
}

module.exports = { APP_URL, CSP, resolveResource, handleTrustedRequest };
