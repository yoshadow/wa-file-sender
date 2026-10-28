'use strict';

const { mkdir, rm } = require('node:fs/promises');
const { setTimeout: delay } = require('node:timers/promises');
const { normalizePhone } = require('../../domain/contact.cjs');
const { SendFailure } = require('../../domain/send-failure.cjs');
const { serializedId } = require('./serialized-id.cjs');
const { sendDocument } = require('./send-document.cjs');

process.umask(0o077);
let config;
let client;
let initialization;
let initializationDone = true;
let stopping = false;
let currentSend;
let qrSequence = 0;
let state = { status: 'idle', account: null, qr: null };

function setState(status, account = null, qr = null, problem = null) {
  state = { status, account, qr, problem };
  process.parentPort.postMessage({ type: 'state', state });
}

async function emitQr(text) {
  const sequence = ++qrSequence;
  const qr = await require('qrcode').toDataURL(text, {
    width: 280,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
  if (!stopping && sequence === qrSequence) setState('qr', null, qr);
}

function connect() {
  if (client || state.status === 'connecting') return;
  stopping = false;
  setState('connecting');
  if (config.mock) {
    initialization = (async () => {
      await emitQr('WA-FILE-SENDER-SIMULATED-QR-NOT-VALID');
      await delay(1500);
      if (!stopping) setState('ready', '15551234567@c.us');
    })();
    return;
  }
  const { Client, LocalAuth } = require('whatsapp-web.js');
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: config.authRoot }),
    puppeteer: {
      executablePath: config.executable,
      headless: true,
      pipe: true,
      args: [],
    },
    webVersionCache: { type: 'none' },
    authTimeoutMs: 60000,
    qrMaxRetries: 5,
  });
  client.on('qr', (qr) => {
    emitQr(qr).catch(() => {
      if (!stopping) setState('error');
    });
  });
  client.on('authenticated', () => {
    ++qrSequence;
    if (!stopping) setState('authenticated');
  });
  client.on('ready', () => {
    ++qrSequence;
    const account = serializedId(client?.info?.wid);
    if (
      !stopping &&
      typeof account === 'string' &&
      /^[0-9]+@(c\.us|lid)$/.test(account)
    )
      setState('ready', account);
    else if (!stopping) setState('error');
  });
  client.on('auth_failure', () => {
    ++qrSequence;
    if (!stopping) setState('error', null, null, 'auth');
  });
  client.on('disconnected', () => {
    ++qrSequence;
    if (!stopping) setState('disconnected');
  });
  initializationDone = false;
  initialization = client
    .initialize()
    .catch(async (error) => {
      if (!stopping) {
        const text = String(error?.message || '');
        const problem = /sandbox/i.test(text)
          ? 'sandbox'
          : /executable|launch|shared libraries/i.test(text)
            ? 'browser'
            : /timeout|navigation|net::/i.test(text)
              ? 'connection'
              : 'compatibility';
        setState('error', null, null, problem);
        await client?.destroy().catch(() => {});
      }
    })
    .finally(() => {
      initializationDone = true;
    });
}

async function closeClient(unlink = false) {
  stopping = true;
  ++qrSequence;
  let remoteRevoked = false;
  if (config.mock) {
    await initialization;
  } else if (client) {
    // A close can arrive while Puppeteer is still launching. Wait for its handle
    // before destroying it so a newly launched browser is not orphaned.
    for (let i = 0; i < 100 && !client.pupBrowser && !initializationDone; i++)
      await delay(100);
    if (unlink && state.status === 'ready') {
      try {
        await Promise.race([
          client.logout(),
          delay(3000).then(() => {
            throw new Error('Logout timeout');
          }),
        ]);
        remoteRevoked = true;
      } catch {
        /* Local removal must still run after the browser closes. */
      }
    }
    await client.destroy();
    await initialization;
  }
  if (currentSend) await currentSend.catch(() => {});
  client = null;
  if (unlink) {
    await rm(config.authRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
    await mkdir(config.authRoot, { recursive: true, mode: 0o700 });
  }
  setState('idle');
  return { remoteRevoked };
}

function assertReady(account) {
  if (
    stopping ||
    state.status !== 'ready' ||
    (account && account !== state.account)
  )
    throw new Error('Session unavailable');
}

async function checkNumber(phone) {
  assertReady();
  if (config.mock) return true;
  return Boolean(await client.getNumberId(normalizePhone(phone).slice(1)));
}

async function verifyBrowser() {
  if (!config.mock) throw new Error('Test-only operation');
  const { Client, MessageMedia } = require('whatsapp-web.js');
  const probe = new Client({
    puppeteer: { executablePath: config.executable, headless: true },
  });
  if (!probe || typeof MessageMedia !== 'function')
    throw new Error('WhatsApp module unavailable');
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({
    executablePath: config.executable,
    headless: true,
    pipe: true,
    args: [],
  });
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    const noNode = await page.evaluate(
      () => typeof globalThis.require === 'undefined',
    );
    const args = browser.process().spawnargs;
    return {
      version: await browser.version(),
      noNode,
      sandboxEnabled:
        !args.includes('--no-sandbox') &&
        !args.includes('--disable-setuid-sandbox'),
    };
  } finally {
    await browser.close();
  }
}

async function dispatch(command, payload) {
  if (command === 'configure') {
    if (config) throw new Error('Already configured');
    config = payload;
    await mkdir(config.authRoot, { recursive: true, mode: 0o700 });
    return true;
  }
  if (!config) throw new Error('Not configured');
  switch (command) {
    case 'connect':
      await closeClient();
      connect();
      return true;
    case 'check-number':
      return checkNumber(payload.phone);
    case 'send-document':
      if (currentSend) throw new Error('Busy');
      currentSend = sendDocument(payload, {
        root: config.documentRoot,
        client,
        assertReady,
        mock: config.mock,
        MessageMedia: config.mock
          ? null
          : require('whatsapp-web.js').MessageMedia,
      });
      try {
        return await currentSend;
      } finally {
        currentSend = null;
      }
    case 'unlink':
      return closeClient(true);
    case 'stop':
      await closeClient();
      return true;
    case 'verify-browser':
      return verifyBrowser();
    default:
      throw new Error('Unknown operation');
  }
}

process.parentPort.on('message', ({ data }) => {
  const { id, command, payload } = data;
  dispatch(command, payload).then(
    (value) =>
      process.parentPort.postMessage({ type: 'reply', id, ok: true, value }),
    (error) =>
      process.parentPort.postMessage({
        type: 'reply',
        id,
        ok: false,
        diagnostic: error instanceof SendFailure ? error.toDiagnostic() : null,
      }),
  );
});
