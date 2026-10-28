'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { createHash } = require('node:crypto');
const { BatchQueue } = require('../../src/services/queue/batch-queue.cjs');
const {
  BatchHistory,
} = require('../../src/adapters/storage/batch-history.cjs');
const { SimulatedTransport } = require('../helpers/simulated-transport.cjs');
const {
  QueueArchives,
} = require('../../src/adapters/compression/queue-archives.cjs');
const { UserError } = require('../../src/domain/contact.cjs');
const { CompressionError } = require('../../src/domain/compression.cjs');
const {
  validateQueuePrepare,
  validateQueueStart,
  validateResolution,
} = require('../../src/domain/queue.cjs');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function fixture(run) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'wa-queue-test-'));
  const file = path.join(root, 'operations.sqlite');
  const history = new BatchHistory(file, 100000);
  const source = {
    revision: 'revision',
    plans: [0, 1].map((index) => ({
      rowId: `row${index}`,
      contactName: `Contacto ${index}`,
      phone: `+1202555012${index}`,
      files: [{ name: 'Prueba.txt', size: 8, sha256: `hash${index}` }],
    })),
  };
  const clock = {
    wall: 100000,
    monotonic: 1000,
    waits: [],
    now() {
      return this.wall;
    },
    mono() {
      return this.monotonic;
    },
    advance(ms) {
      this.wall += ms;
      this.monotonic += ms;
    },
    async wait(ms, signal) {
      signal.throwIfAborted();
      this.waits.push(ms);
      this.advance(ms);
    },
  };
  const archives = {
    active: 0,
    cancels: 0,
    async review(plan) {
      const files = plan.files.map((item) => ({ ...item }));
      return {
        rowId: plan.rowId,
        contactName: plan.contactName,
        phone: plan.phone,
        files,
        name: `${plan.contactName}.zip`,
        totalBytes: files.reduce((sum, item) => sum + item.size, 0),
        bundleHash: createHash('sha256')
          .update(JSON.stringify(files))
          .digest('hex'),
      };
    },
    async create() {
      assert.equal(this.active, 0);
      this.active = 1;
      return { file: '/PRIVATE/temporary.zip', size: 1 };
    },
    async clean() {
      this.active = 0;
    },
    cancel() {
      this.cancels++;
    },
  };
  const transport = new SimulatedTransport();
  const account = {
    mode: 'simulation',
    account: 'SIMULATED-LOCAL',
    ready: true,
  };
  transport.state = () => account;
  const sends = [];
  const send = transport.send.bind(transport);
  transport.send = async (...args) => {
    assert.equal(archives.active, 1);
    assert.equal(history.page(0).rows[0].status, 'sending');
    sends.push(clock.now());
    return send(...args);
  };
  const prompts = [],
    decisions = {};
  const queue = new BatchQueue({
    archives,
    history,
    transport,
    clock,
    getPlans: (revision) => {
      if (revision !== source.revision)
        throw new UserError('La selección cambió.');
      return source;
    },
    confirm: async (kind) => {
      prompts.push(kind);
      return decisions[kind] !== false;
    },
  });
  const prepare = async (options = {}) =>
    queue.prepare({
      revision: source.revision,
      intervalSeconds: 10,
      outcome: 'success',
      ...options,
    });
  const start = async () => {
    await queue.start(queue.review.id);
    await queue.pending;
    return queue.state();
  };
  try {
    await run({
      root,
      file,
      history,
      source,
      clock,
      archives,
      transport,
      account,
      sends,
      prompts,
      decisions,
      queue,
      prepare,
      start,
    });
  } finally {
    if (history.db.open) history.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('queue writes before transport, sends sequentially, cleans each ZIP and waits from the preceding completion', async () =>
  fixture(
    async ({
      queue,
      prepare,
      start,
      clock,
      history,
      transport,
      sends,
      archives,
    }) => {
      const send = transport.send;
      transport.send = async (...args) => {
        const result = await send(...args);
        clock.advance(3000);
        return result;
      };
      await prepare();
      assert.equal(history.page(0).total, 0);
      assert.equal((await start()).status, 'completed');
      assert.equal(sends.length, 2);
      assert.equal(sends[1] - sends[0], 13000);
      assert.deepEqual(clock.waits, [10000]);
      assert.equal(archives.active, 0);
      assert.equal(queue.state().completed, 2);
      assert.ok(
        history
          .page(0)
          .rows.every(
            (row) =>
              row.status === 'sent' &&
              row.mode === 'simulation' &&
              row.messageId.startsWith('SIM-'),
          ),
      );
    },
  ));

test('queue enforces minimum interval and binds account, revision and chosen interval to confirmation', async () =>
  fixture(async ({ queue, prepare, start, source, account, sends, clock }) => {
    await assert.rejects(prepare({ intervalSeconds: 9 }), /10 y 3600/);
    await prepare({ intervalSeconds: 30 });
    await start();
    assert.deepEqual(clock.waits, [30000]);
    await prepare();
    queue.confirm = async () => {
      source.revision = 'changed';
      return true;
    };
    await start();
    assert.equal(sends.length, 2);
    await prepare();
    queue.confirm = async () => {
      account.account = 'another';
      return true;
    };
    await start();
    assert.equal(sends.length, 2);
  }));

test('cancelled final confirmation registers no batch or attempt and never invokes transport', async () =>
  fixture(async ({ prepare, start, decisions, history, sends }) => {
    await prepare();
    decisions['queue-start'] = false;
    assert.equal((await start()).status, 'review');
    assert.equal(
      history.db.prepare('SELECT COUNT(*) AS total FROM batches').get().total,
      0,
    );
    assert.equal(sends.length, 0);
  }));

test('exact duplicate sets require a separate explicit authorization and a fresh final confirmation', async () =>
  fixture(async ({ prepare, start, queue, decisions, prompts, sends }) => {
    await prepare();
    await start();
    await prepare();
    assert.equal(queue.review.items[0].risks.exact, true);
    decisions['queue-repeat'] = false;
    await start();
    assert.equal(sends.length, 2);
    assert.equal(prompts.at(-1), 'queue-repeat');
    decisions['queue-repeat'] = true;
    await start();
    assert.equal(sends.length, 4);
    assert.deepEqual(prompts.slice(-2), ['queue-repeat', 'queue-start']);
  }));

test('previous files in a different set need explicit inclusion, scoped by mode, account and recipient', async () =>
  fixture(
    async ({
      source,
      prepare,
      start,
      decisions,
      prompts,
      queue,
      history,
      sends,
    }) => {
      source.plans = [source.plans[0]];
      await prepare();
      await start();
      const first = queue.plans[0];
      source.plans[0] = {
        ...first,
        files: [...first.files, { name: 'Otro.txt', size: 2, sha256: 'new' }],
      };
      await prepare();
      const item = queue.review.items[0];
      assert.deepEqual(item.risks.repeatedFiles, ['Prueba.txt']);
      assert.deepEqual(history.risks('live', 'SIMULATED-LOCAL', item), {
        blocked: false,
        exact: false,
        repeatedFiles: [],
      });
      assert.equal(history.risks('simulation', 'other', item).exact, false);
      assert.equal(
        history.risks('simulation', 'SIMULATED-LOCAL', {
          ...item,
          phone: '+12025550199',
        }).repeatedFiles.length,
        0,
      );
      decisions['queue-files'] = false;
      await start();
      assert.equal(sends.length, 1);
      decisions['queue-files'] = true;
      await start();
      assert.equal(sends.length, 2);
      assert.deepEqual(prompts.slice(-2), ['queue-files', 'queue-start']);
    },
  ));

test('an uncertain attempt stops the lot, blocks even changed sets and needs explicit review without resuming', async () =>
  fixture(
    async ({ prepare, start, queue, history, sends, decisions, source }) => {
      await prepare({ outcome: 'uncertain' });
      assert.equal((await start()).status, 'uncertain');
      assert.equal(sends.length, 1);
      const attempt = history.page(0).rows[0];
      assert.equal(attempt.status, 'uncertain');
      source.plans[0].files.push({
        name: 'Different.txt',
        size: 1,
        sha256: 'different',
      });
      await prepare();
      assert.equal(queue.review.items[0].risks.blocked, true);
      await start();
      assert.equal(sends.length, 1);
      decisions['queue-resolve'] = false;
      await queue.resolve(attempt.id, 'not-sent');
      assert.equal(history.uncertain(attempt.id).id, attempt.id);
      decisions['queue-resolve'] = true;
      await queue.resolve(attempt.id, 'not-sent');
      assert.equal(history.uncertain(attempt.id), undefined);
      assert.equal(sends.length, 1);
      assert.equal(history.page(0).rows[0].status, 'uncertain');
      assert.equal(history.page(0).rows[0].resolution, 'not-sent');
      await prepare();
      await start();
      assert.equal(sends.length, 3);
    },
  ));

test('confirmed simulated success after uncertainty protects the set as a duplicate', async () =>
  fixture(async ({ prepare, start, queue, history, source }) => {
    source.plans = [source.plans[0]];
    await prepare({ outcome: 'uncertain' });
    await start();
    await queue.resolve(history.page(0).rows[0].id, 'sent');
    await prepare();
    assert.equal(queue.review.items[0].risks.exact, true);
  }));

test('a preflight or compression failure stops before dispatch, records failure and does not try the next contact', async () =>
  fixture(async ({ prepare, start, sends, history, archives }) => {
    await prepare({ outcome: 'failure' });
    assert.equal((await start()).status, 'failed');
    assert.equal(sends.length, 0);
    assert.equal(history.page(0).total, 1);
    assert.equal(history.page(0).rows[0].errorCode, 'PREFLIGHT');
    archives.create = async () => {
      throw new CompressionError('CHANGED');
    };
    await prepare();
    await start();
    assert.equal(sends.length, 0);
    assert.equal(history.page(0).total, 2);
    assert.equal(history.page(0).rows[0].status, 'failed');
    assert.equal(archives.active, 0);
  }));

test('missing receipt is uncertain and a disconnect prevents the following attempt', async () =>
  fixture(async ({ prepare, start, transport, sends, history, account }) => {
    const send = transport.send;
    transport.send = async (...args) => {
      await send(...args);
      return undefined;
    };
    await prepare();
    assert.equal((await start()).status, 'uncertain');
    assert.equal(history.page(0).total, 1);
    assert.equal(sends.length, 1);
    history.clear();
    transport.send = async (...args) => {
      const result = await send(...args);
      account.ready = false;
      return result;
    };
    await prepare();
    assert.equal((await start()).status, 'failed');
    assert.equal(history.page(0).total, 1);
  }));

test('stop during countdown cancels waiting, does not retry and an explicit new lot respects the remaining pause', async () =>
  fixture(async ({ queue, prepare, start, clock, sends, source }) => {
    const entered = deferred();
    const normalWait = clock.wait.bind(clock);
    clock.wait = (_ms, signal) => {
      entered.resolve();
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('Stopped')), {
          once: true,
        }),
      );
    };
    await prepare();
    const running = start();
    await entered.promise;
    assert.equal(queue.state().countdown, 10);
    queue.stop();
    await running;
    assert.equal(queue.state().status, 'stopped');
    assert.equal(sends.length, 1);
    await assert.rejects(queue.start('old'), /Revisa/);
    source.plans = [source.plans[1]];
    clock.wait = normalWait;
    await prepare();
    await start();
    assert.equal(sends.length, 2);
    assert.deepEqual(clock.waits, [10000]);
  }));

test('stop during compression prevents dispatch and stop during dispatch waits for its actual simulated result', async () =>
  fixture(
    async ({ queue, prepare, start, archives, transport, sends, history }) => {
      const entered = deferred(),
        release = deferred();
      const create = archives.create.bind(archives);
      archives.create = async (...args) => {
        entered.resolve();
        await release.promise;
        return create(...args);
      };
      await prepare();
      const running = start();
      await entered.promise;
      queue.stop();
      release.resolve();
      await running;
      assert.equal(sends.length, 0);
      assert.equal(history.page(0).rows[0].status, 'cancelled');
      archives.create = create;
      const sending = deferred(),
        received = deferred(),
        send = transport.send;
      transport.send = async (...args) => {
        const result = await send(...args);
        sending.resolve();
        await received.promise;
        return result;
      };
      await prepare();
      const second = start();
      await sending.promise;
      queue.stop();
      received.resolve();
      await second;
      assert.equal(queue.state().status, 'stopped');
      assert.equal(sends.length, 1);
      assert.equal(history.page(0).rows[0].status, 'sent');
      assert.equal(archives.active, 0);
    },
  ));

test('a failed result write leaves durable evidence that recovers as uncertain rather than resending', async () =>
  fixture(async ({ prepare, start, history, file, sends }) => {
    history.finishAttempt = () => {
      throw new Error('SECRET database failure');
    };
    await prepare();
    assert.equal((await start()).status, 'uncertain');
    assert.equal(sends.length, 1);
    assert.equal(history.page(0).rows[0].status, 'sending');
    history.close();
    const recovered = new BatchHistory(file, 200000);
    try {
      assert.equal(recovered.page(0).rows[0].status, 'uncertain');
      assert.equal(recovered.lastEnd('simulation', 'SIMULATED-LOCAL'), 200000);
    } finally {
      recovered.close();
    }
  }));

test('a failed pre-dispatch write never calls transport, and cleanup failure stops the next recipient', async () =>
  fixture(async ({ prepare, start, history, archives, sends }) => {
    const mark = history.markSending.bind(history);
    history.markSending = () => {
      throw new Error('Database error');
    };
    await prepare();
    await start();
    assert.equal(sends.length, 0);
    assert.equal(history.page(0).rows[0].status, 'failed');
    history.markSending = mark;
    const clean = archives.clean.bind(archives);
    archives.clean = async () => {
      if (archives.active) throw new CompressionError('CLEANUP');
      return clean();
    };
    await prepare();
    assert.equal((await start()).status, 'failed');
    assert.equal(sends.length, 1);
    assert.equal(history.page(0).rows[0].status, 'sent');
  }));

test('restart classifies preparing separately from sending, preserves cooldown and starts no work', async () =>
  fixture(async ({ prepare, queue, history, file }) => {
    await prepare();
    const review = queue.review;
    const batch = history.beginBatch(review, 100000);
    history.beginAttempt(batch, review, review.items[0], 100000);
    const sending = history.beginAttempt(
      batch,
      review,
      review.items[1],
      100001,
    );
    history.markSending(sending);
    history.close();
    const restored = new BatchHistory(file, 100100);
    try {
      assert.deepEqual(
        restored.page(0).rows.map((row) => row.status),
        ['uncertain', 'cancelled'],
      );
      assert.equal(
        restored.db.prepare('SELECT status FROM batches').get().status,
        'interrupted',
      );
      assert.equal(restored.lastEnd('simulation', 'SIMULATED-LOCAL'), 100100);
    } finally {
      restored.close();
    }
  }));

test('a wall-clock jump cannot bypass the monotonic pause in the active process', async () =>
  fixture(async ({ prepare, start, clock, archives, sends }) => {
    const clean = archives.clean.bind(archives);
    archives.clean = async () => {
      await clean();
      if (sends.length === 1) clock.wall += 3600000;
    };
    await prepare();
    await start();
    assert.deepEqual(clock.waits, [10000]);
  }));

test('cancelled review and invalidated revisions never leave an approved runnable batch', async () =>
  fixture(async ({ prepare, queue, archives, source, history }) => {
    const entered = deferred(),
      release = deferred();
    const review = archives.review.bind(archives);
    archives.review = async (...args) => {
      entered.resolve();
      await release.promise;
      return review(...args);
    };
    const pending = prepare();
    await entered.promise;
    assert.throws(() => queue.invalidate(), /Detén/);
    queue.stop();
    release.resolve();
    await pending;
    assert.equal(queue.review, null);
    assert.equal(history.page(0).total, 0);
    assert.equal(archives.cancels, 1);
    archives.review = review;
    await prepare();
    const id = queue.review.id;
    source.revision = 'new';
    queue.invalidate();
    await assert.rejects(queue.start(id), /Revisa/);
  }));

test('archive bridge compares regenerated hashes before creating any ZIP', async () => {
  const calls = [];
  const archive = new QueueArchives({
    request: async (command) => {
      calls.push(command);
      return { bundleHash: 'changed' };
    },
  });
  await assert.rejects(archive.create({}, { bundleHash: 'approved' }), {
    code: 'CHANGED',
  });
  assert.deepEqual(calls, ['prepare']);
});

test('queue IPC rejects arbitrary paths, transport/account injection, unsafe intervals and unknown resolutions', () => {
  validateQueuePrepare([
    { revision: 'r', intervalSeconds: 10, outcome: 'success' },
  ]);
  validateQueueStart([{ id: 'id' }]);
  validateResolution([{ id: 'id', resolution: 'not-sent' }]);
  for (const config of [
    { revision: 'r', intervalSeconds: 9, outcome: 'success' },
    { revision: 'r', intervalSeconds: 10, outcome: 'success', account: 'real' },
    { revision: 'r', intervalSeconds: '10', outcome: 'success' },
    { revision: 'r', intervalSeconds: 10, outcome: 'live' },
  ])
    assert.throws(() => validateQueuePrepare([config]));
  assert.throws(() => validateQueueStart([{ id: 'x', path: '/etc/passwd' }]));
  assert.throws(() => validateResolution([{ id: 'id', resolution: 'delete' }]));
});

test('the approved caption is identical for every recipient and is bounded at the IPC boundary', async () =>
  fixture(async ({ queue, transport, prepare, start }) => {
    const caption = 'Mensaje común\npara todos 😊';
    const captions = [];
    const send = transport.send.bind(transport);
    transport.send = async (...args) => {
      captions.push(args[3]);
      return send(...args);
    };
    await prepare({ message: caption });
    assert.equal(queue.review.message, caption);
    await start();
    assert.deepEqual(captions, [caption, caption]);
    const base = {
      revision: 'r',
      intervalSeconds: 10,
      outcome: 'success',
      mode: 'whatsapp',
    };
    for (const message of [null, {}, 12, 'x'.repeat(1001), 'control\u0000'])
      assert.throws(() => validateQueuePrepare([{ ...base, message }]));
    validateQueuePrepare([{ ...base, message: '' }]);
  }));

test('the desktop confirmation button can start directly while recording sent phones by account', async () =>
  fixture(async ({ queue, prepare, start, prompts, history, sends }) => {
    queue.confirmStart = false;
    await prepare();
    await start();
    assert.equal(sends.length, 2);
    assert.equal(prompts.includes('queue-start'), false);
    assert.equal(history.sentPhones('simulation', 'SIMULATED-LOCAL').length, 2);
    assert.deepEqual(history.sentPhones('whatsapp', 'SIMULATED-LOCAL'), []);
    assert.deepEqual(history.sentPhones('simulation', 'another-account'), []);
  }));
