'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { MessageMedia } = require('whatsapp-web.js');
const {
  scanDirectory,
} = require('../../src/services/files/scan-directory.cjs');
const {
  CompressionSession,
} = require('../../src/services/compression/session.cjs');
const {
  loadDocument,
} = require('../../src/adapters/whatsapp/document-media.cjs');
const {
  sendDocument,
} = require('../../src/adapters/whatsapp/send-document.cjs');
const {
  WhatsAppTransport,
} = require('../../src/adapters/transport/whatsapp.cjs');
const {
  QueueArchives,
} = require('../../src/adapters/compression/queue-archives.cjs');
const { BatchQueue } = require('../../src/services/queue/batch-queue.cjs');
const {
  BatchHistory,
} = require('../../src/adapters/storage/batch-history.cjs');
const { SendFailure } = require('../../src/domain/send-failure.cjs');
const { validateQueuePrepare } = require('../../src/domain/queue.cjs');
const { readZip } = require('../helpers/read-zip.cjs');

async function fixture(run) {
  const directory = await fs.mkdtemp(
    path.join(tmpdir(), 'wa-live-adapter-test-'),
  );
  let history;
  try {
    const root = await fs.realpath(directory);
    const sources = path.join(root, 'source');
    await fs.mkdir(path.join(sources, 'Ana Pérez'), { recursive: true });
    await fs.writeFile(
      path.join(sources, 'Ana Pérez', 'Prueba á.txt'),
      'Documento ficticio á',
    );
    const plan = {
      root: sources,
      folderName: 'Ana Pérez',
      contactName: 'Ana Pérez',
      rowId: 'ana',
      phone: '+12025550123',
      revision: 'revision',
      files: (await scanDirectory(sources)).folders[0].files,
    };
    const temp = path.join(root, 'document-zips');
    const session = new CompressionSession(temp);
    const review = await session.prepare(plan);
    const zip = await session.generate(review.token);
    const account = '15551234567@c.us';
    let currentAccount = account;
    const calls = [];
    const client = {
      getNumberId: async () => ({ _serialized: '12025550123@c.us' }),
      sendMessage: async (...args) => {
        calls.push(args);
        return { id: { $1: 'FAKE-LOCAL-RECEIPT' } };
      },
    };
    const deps = {
      root: temp,
      client,
      MessageMedia,
      assertReady: (value) => {
        if (value !== currentAccount) throw new Error('Session unavailable');
      },
    };
    history = new BatchHistory(path.join(root, 'operations.sqlite'));
    await run({
      root,
      plan,
      temp,
      session,
      zip,
      account,
      deps,
      client,
      calls,
      history,
      changeAccount: (value) => {
        currentAccount = value;
      },
    });
  } finally {
    history?.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('WhatsApp document adapter passes the exact approved ZIP as a document with a genuine library media object and no retry', async () =>
  fixture(async ({ zip, account, deps, calls }) => {
    const result = await sendDocument(
      { zip, phone: '+12025550123', account },
      deps,
    );
    assert.equal(result.messageId, 'FAKE-LOCAL-RECEIPT');
    assert.equal(calls.length, 1);
    const [recipient, media, options] = calls[0];
    assert.equal(recipient, '12025550123@c.us');
    assert.equal(media.filename, 'Ana Pérez.zip');
    assert.equal(media.mimetype, 'application/zip');
    assert.equal(
      readZip(Buffer.from(media.data, 'base64')).get('Prueba á.txt').toString(),
      'Documento ficticio á',
    );
    assert.deepEqual(options, {
      sendMediaAsDocument: true,
      sendSeen: false,
      waitUntilMsgSent: true,
    });
  }));

test('temporary ZIP validation rejects same-size tampering, external paths and oversized descriptors before any client send', async () =>
  fixture(async ({ zip, temp, account, deps, calls }) => {
    await assert.rejects(loadDocument(path.dirname(temp), zip), {
      code: 'ZIP_PATH',
      mayHaveSent: false,
    });
    await assert.rejects(
      loadDocument(temp, { ...zip, size: 20 * 1024 * 1024 + 1 }),
      { code: 'ZIP_CHANGED', mayHaveSent: false },
    );
    await fs.writeFile(zip.file, Buffer.alloc(zip.size, 42));
    await assert.rejects(
      sendDocument({ zip, phone: '+12025550123', account }, deps),
      { code: 'ZIP_CHANGED', mayHaveSent: false },
    );
    assert.equal(calls.length, 0);
  }));

test('a caption is sent in the same document message, preserving Unicode and line breaks without an extra send', async () =>
  fixture(async ({ zip, account, deps, calls }) => {
    const caption = 'Hola, aquí están tus archivos.\nGracias 😊';
    await sendDocument(
      { zip, phone: '+12025550123', account, message: caption },
      deps,
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2].caption, caption);
    assert.equal(calls[0][2].sendMediaAsDocument, true);
    for (const message of [null, {}, 'a'.repeat(1001), 'hola\u0000'])
      await assert.rejects(
        sendDocument({ zip, phone: '+12025550123', account, message }, deps),
        { code: 'MESSAGE_INVALID', mayHaveSent: false },
      );
    assert.equal(calls.length, 1);
  }));

test('symbolic-link ZIP replacement is rejected without touching the linked data', async (t) =>
  fixture(async ({ zip, temp, root }) => {
    const outside = path.join(root, 'outside.zip');
    await fs.rename(zip.file, outside);
    try {
      await fs.symlink(outside, zip.file, 'file');
    } catch (error) {
      if (error.code === 'EPERM') {
        t.skip('Enlaces de prueba no permitidos.');
        return;
      }
      throw error;
    }
    await assert.rejects(loadDocument(temp, zip), {
      code: 'ZIP_PATH',
      mayHaveSent: false,
    });
    assert.equal((await fs.stat(outside)).size, zip.size);
  }));

test('a recipient lookup that changes the sender or resolves a group is rejected before dispatch', async () =>
  fixture(async ({ zip, account, deps, client, calls, changeAccount }) => {
    client.getNumberId = async () => {
      changeAccount('other@c.us');
      return { _serialized: '12025550123@c.us' };
    };
    await assert.rejects(
      sendDocument({ zip, phone: '+12025550123', account }, deps),
      { code: 'SESSION_CHANGED', mayHaveSent: false },
    );
    changeAccount(account);
    client.getNumberId = async () => ({ _serialized: '12345@g.us' });
    await assert.rejects(
      sendDocument({ zip, phone: '+12025550123', account }, deps),
      { code: 'RECIPIENT_UNAVAILABLE', mayHaveSent: false },
    );
    assert.equal(calls.length, 0);
  }));

test('PN/LID identifiers are accepted, missing message identifiers and client errors stay uncertain without resending', async () =>
  fixture(async ({ zip, account, deps, client, calls }) => {
    client.getNumberId = async () => ({ $1: '12025550123@lid' });
    await sendDocument({ zip, phone: '+12025550123', account }, deps);
    assert.equal(calls[0][0], '12025550123@lid');
    client.sendMessage = async (...args) => {
      calls.push(args);
      return undefined;
    };
    await assert.rejects(
      sendDocument({ zip, phone: '+12025550123', account }, deps),
      { code: 'NO_MESSAGE_ID', mayHaveSent: true },
    );
    client.sendMessage = async (...args) => {
      calls.push(args);
      throw new Error('media-fault SECRET');
    };
    await assert.rejects(
      sendDocument({ zip, phone: '+12025550123', account }, deps),
      { code: 'MEDIA_PREPARATION', mayHaveSent: true },
    );
    assert.equal(calls.length, 3);
  }));

test('WhatsApp transport validates recipients and closes an uncertain worker before returning', async () => {
  let stopped = 0,
    dispatched = 0;
  const adapter = {
    state: { status: 'ready', account: 'sender@c.us' },
    checkNumber: async () => false,
    sendDocument: async () => {
      dispatched++;
      throw new SendFailure({ code: 'TIMEOUT' });
    },
    stop: async () => {
      stopped++;
    },
  };
  const transport = new WhatsAppTransport(adapter, () => 100);
  assert.equal(transport.state().mode, 'whatsapp');
  assert.equal(transport.selectMode, undefined);
  assert.equal(transport.lastEnd(), 100);
  transport.latestBatchEnd = () => 200;
  assert.equal(transport.lastEnd(), 200);
  await assert.rejects(transport.check({ phone: '+12025550123' }), {
    code: 'RECIPIENT_UNAVAILABLE',
    mayHaveSent: false,
  });
  assert.equal(dispatched, 0);
  await assert.rejects(transport.send({}, { phone: '+12025550123' }), {
    code: 'TIMEOUT',
  });
  assert.equal(stopped, 1);
  assert.equal(dispatched, 1);
  adapter.sendDocument = async () => {
    throw new SendFailure({ code: 'ZIP_CHANGED', mayHaveSent: false });
  };
  await assert.rejects(transport.send({}, { phone: '+12025550123' }), {
    code: 'ZIP_CHANGED',
  });
  assert.equal(stopped, 1);
});

test('queue routes approved documents through the WhatsApp adapter and stores separate real-mode evidence; no network client is initialized', async () =>
  fixture(async ({ plan, session, history, account, deps, calls }) => {
    let now = 100000;
    const adapter = {
      state: { status: 'ready', account },
      checkNumber: async () => true,
      sendDocument: (zip, phone, sender) =>
        sendDocument({ zip, phone, account: sender }, deps),
      stop: async () => {},
    };
    const transport = new WhatsAppTransport(adapter, () => 0);
    const queue = new BatchQueue({
      archives: new QueueArchives({
        request: (command, payload) =>
          command === 'prepare'
            ? session.prepare(payload)
            : command === 'generate'
              ? session.generate(payload.token)
              : session.reset(),
      }),
      history,
      transport,
      getPlans: () => ({ revision: 'revision', plans: [plan] }),
      confirm: async () => true,
      clock: {
        now: () => now,
        mono: () => now,
        wait: async (ms) => {
          now += ms;
        },
      },
    });
    const rejected = await queue.prepare({
      revision: 'revision',
      intervalSeconds: 10,
      outcome: 'success',
      mode: 'simulation',
    });
    assert.equal(rejected.status, 'failed');
    assert.equal(rejected.review, null);
    assert.equal(calls.length, 0);
    assert.equal(history.page(0).total, 0);
    await queue.prepare({
      revision: 'revision',
      intervalSeconds: 10,
      outcome: 'success',
      mode: 'whatsapp',
    });
    assert.equal(queue.review.items[0].risks.exact, false);
    assert.equal(queue.review.account, account);
    await queue.start(queue.review.id);
    await queue.pending;
    assert.equal(queue.state().status, 'completed');
    assert.equal(calls.length, 1);
    assert.equal(history.page(0).rows[0].mode, 'whatsapp');
    assert.equal(history.page(0).rows[0].messageId, 'FAKE-LOCAL-RECEIPT');
    await queue.prepare({
      revision: 'revision',
      intervalSeconds: 10,
      outcome: 'success',
      mode: 'whatsapp',
    });
    assert.equal(queue.review.items[0].risks.exact, true);
    assert.equal((await fs.readdir(session.root)).length, 0);
  }));

test('real-mode queue refuses an unavailable account, refuses failure scenarios, and records definite local rejection as failed', async () =>
  fixture(async ({ plan, history }) => {
    const adapter = {
      state: { status: 'idle', account: null },
      checkNumber: async () => true,
      sendDocument: async () => {
        throw new SendFailure({ code: 'ZIP_CHANGED', mayHaveSent: false });
      },
    };
    const transport = new WhatsAppTransport(adapter, () => 0);
    const item = {
      contactName: plan.contactName,
      phone: plan.phone,
      files: [{ name: 'x', size: 1, sha256: 'hash' }],
      bundleHash: 'hash',
    };
    const queue = new BatchQueue({
      archives: {
        review: async () => item,
        clean: async () => {},
        create: async () => ({}),
      },
      history,
      transport,
      getPlans: () => ({ revision: 'revision', plans: [plan] }),
      confirm: async () => true,
    });
    const config = {
      revision: 'revision',
      intervalSeconds: 10,
      outcome: 'success',
      mode: 'whatsapp',
    };
    assert.equal((await queue.prepare(config)).status, 'failed');
    assert.equal(history.page(0).total, 0);
    assert.throws(() =>
      validateQueuePrepare([{ ...config, outcome: 'uncertain' }]),
    );
    adapter.state = { status: 'ready', account: 'sender@c.us' };
    await queue.prepare(config);
    await queue.start(queue.review.id);
    await queue.pending;
    assert.equal(history.page(0).rows[0].status, 'failed');
    assert.equal(history.page(0).rows[0].errorCode, 'ZIP_CHANGED');
  }));

test('a disconnect during countdown aborts the next real-mode attempt and invalidates idle confirmation', async () =>
  fixture(async ({ plan, history }) => {
    const adapter = { state: { status: 'ready', account: 'sender@c.us' } };
    const transport = new WhatsAppTransport(adapter, () => 100000);
    const item = {
      contactName: plan.contactName,
      phone: plan.phone,
      files: [],
      bundleHash: 'hash',
    };
    let waiting;
    const entered = new Promise((resolve) => {
      waiting = resolve;
    });
    const queue = new BatchQueue({
      archives: { review: async () => item, clean: async () => {} },
      history,
      transport,
      getPlans: () => ({ revision: 'revision', plans: [plan] }),
      confirm: async () => true,
      clock: {
        now: () => 100000,
        mono: () => 1000,
        wait: (_ms, signal) => {
          waiting();
          return new Promise((_resolve, reject) =>
            signal.addEventListener(
              'abort',
              () => reject(new Error('Disconnected')),
              { once: true },
            ),
          );
        },
      },
    });
    const config = {
      revision: 'revision',
      intervalSeconds: 10,
      outcome: 'success',
      mode: 'whatsapp',
    };
    await queue.prepare(config);
    adapter.state.status = 'disconnected';
    queue.connectionChanged();
    assert.equal(queue.review, null);
    adapter.state.status = 'ready';
    await queue.prepare(config);
    await queue.start(queue.review.id);
    await entered;
    adapter.state.status = 'disconnected';
    queue.connectionChanged();
    await queue.pending;
    assert.equal(queue.state().status, 'failed');
    assert.equal(history.page(0).total, 0);
  }));

test('a disconnection while dispatching preserves uncertainty and cleans the ZIP only after the adapter settles', async () =>
  fixture(async ({ plan, history }) => {
    let entered, rejectSend;
    const sending = new Promise((resolve) => {
      entered = resolve;
    });
    let settled = false,
      cleaned = 0,
      sends = 0;
    const adapter = {
      state: { status: 'ready', account: 'sender@c.us' },
      checkNumber: async () => true,
      sendDocument: async () => {
        sends++;
        entered();
        try {
          return await new Promise((_resolve, reject) => {
            rejectSend = reject;
          });
        } finally {
          settled = true;
        }
      },
      stop: async () => {
        rejectSend?.(
          new SendFailure({ code: 'CONNECTION_LOST', mayHaveSent: true }),
        );
      },
    };
    const item = {
      contactName: plan.contactName,
      phone: plan.phone,
      files: [],
      bundleHash: 'hash',
    };
    const queue = new BatchQueue({
      archives: {
        review: async () => item,
        create: async () => ({}),
        clean: async () => {
          if (sends) assert.equal(settled, true);
          cleaned++;
        },
      },
      transport: new WhatsAppTransport(adapter, () => 0),
      history,
      getPlans: () => ({ revision: 'revision', plans: [plan, plan] }),
      confirm: async () => true,
    });
    await queue.prepare({
      revision: 'revision',
      intervalSeconds: 10,
      outcome: 'success',
      mode: 'whatsapp',
    });
    await queue.start(queue.review.id);
    await sending;
    adapter.state.status = 'disconnected';
    queue.connectionChanged();
    await queue.pending;
    assert.equal(queue.state().status, 'uncertain');
    assert.equal(sends, 1);
    assert.equal(cleaned, 2);
    assert.equal(history.page(0).total, 1);
    assert.equal(history.page(0).rows[0].status, 'uncertain');
    assert.equal(history.page(0).rows[0].errorCode, 'CONNECTION_LOST');
  }));
