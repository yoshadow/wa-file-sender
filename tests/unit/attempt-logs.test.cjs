'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { tmpdir } = require('node:os');
const {
  AttemptLogs,
  LogError,
} = require('../../src/adapters/storage/attempt-logs.cjs');
const {
  BatchHistory,
} = require('../../src/adapters/storage/batch-history.cjs');
const { BatchQueue } = require('../../src/services/queue/batch-queue.cjs');
const {
  removeLegacyHistory,
} = require('../../src/adapters/storage/remove-legacy-history.cjs');
const { CompressionError } = require('../../src/domain/compression.cjs');

async function fixture(run) {
  const temp = await fs.mkdtemp(path.join(tmpdir(), 'wa-attempt-log-test-'));
  const root = await fs.realpath(temp);
  const history = new BatchHistory(':memory:');
  try {
    const logs = new AttemptLogs();
    const item = {
      contactName: 'Ana Pérez',
      phone: '+12025550123',
      name: 'Ana Pérez.zip',
      bundleHash: 'content-hash',
      files: [{ name: 'Texto.txt', size: 4, sha256: 'file-hash' }],
    };
    const plan = { root };
    let now = 100000,
      sends = 0;
    const transport = {
      state: () => ({
        ready: true,
        mode: 'simulation',
        account: 'SIMULATED-LOCAL',
      }),
      check: async () => {},
      send: async () => {
        sends++;
        return { id: 'SIM-RECEIPT' };
      },
    };
    const archives = {
      review: async () => item,
      create: async () => ({ name: item.name, size: 200, sha256: 'zip-hash' }),
      clean: async () => {},
    };
    const queue = new BatchQueue({
      logs,
      history,
      transport,
      archives,
      getPlans: () => ({ revision: 'review', plans: [plan] }),
      confirm: async () => true,
      clock: {
        now: () => now,
        mono: () => now,
        wait: async (ms) => {
          now += ms;
        },
      },
    });
    const prepare = () =>
      queue.prepare({
        revision: 'review',
        intervalSeconds: 10,
        outcome: 'success',
      });
    const send = async () => {
      await prepare();
      await queue.start(queue.review.id);
      await queue.pending;
    };
    const records = async () => {
      const names = (await fs.readdir(root)).filter((name) =>
        name.endsWith('.log'),
      );
      return Promise.all(
        names.map(async (name) => ({
          name,
          events: (await fs.readFile(path.join(root, name), 'utf8'))
            .trim()
            .split('\n')
            .map(JSON.parse),
        })),
      );
    };
    await run({
      root,
      logs,
      item,
      plan,
      queue,
      archives,
      history,
      transport,
      prepare,
      send,
      records,
      sends: () => sends,
    });
  } finally {
    history.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
}

test('each confirmed batch produces a distinct log in the selected root with result and safe metadata', async () =>
  fixture(async ({ root, send, records, sends, prepare, queue }) => {
    await prepare();
    queue.confirm = async () => false;
    await queue.start(queue.review.id);
    assert.deepEqual(await records(), []);
    queue.confirm = async () => true;
    await send();
    await send();
    assert.equal(sends(), 2);
    const logs = await records();
    assert.equal(logs.length, 2);
    assert.notEqual(logs[0].name, logs[1].name);
    for (const log of logs) {
      assert.deepEqual(
        log.events.map((event) => event.evento),
        [
          'lote_iniciado',
          'intento_iniciado',
          'zip_generado',
          'envio_iniciado',
          'resultado',
          'limpieza',
          'lote_finalizado',
        ],
      );
      assert.equal(log.events[1].telefono, '+12025550123');
      assert.equal(log.events[1].archivos[0].nombre, 'Texto.txt');
      assert.equal(log.events[4].identificadorMensaje, 'SIM-RECEIPT');
      if (process.platform !== 'win32')
        assert.equal(
          (await fs.stat(path.join(root, log.name))).mode & 0o777,
          0o600,
        );
    }
  }));

test('compression and preflight failures are logged without transmitting or leaking raw exceptions', async () =>
  fixture(async ({ archives, transport, send, records, sends }) => {
    archives.create = async () => {
      throw new CompressionError('CHANGED');
    };
    await send();
    let log = (await records())[0];
    assert.equal(
      log.events.find((event) => event.evento === 'error').codigo,
      'CHANGED',
    );
    archives.create = async () => ({ name: 'Ana Pérez.zip', size: 1 });
    transport.check = async () => {
      throw new Error('SECRET /private/session/token');
    };
    await send();
    const logs = await records();
    assert.ok(
      logs.some((log) =>
        log.events.some((event) => event.codigo === 'PREFLIGHT'),
      ),
    );
    assert.equal(JSON.stringify(logs).includes('SECRET'), false);
    assert.equal(sends(), 0);
  }));

test('one batch log groups all recipients and associates every event with its attempt and phone', async () =>
  fixture(async ({ root, queue, archives, item, send, records }) => {
    const plans = [
      { root, contactName: 'Ana', phone: '+12025550123' },
      { root, contactName: 'Bruno', phone: '+12025550124' },
    ];
    queue.getPlans = () => ({ revision: 'review', plans });
    archives.review = async (plan) => ({
      ...item,
      contactName: plan.contactName,
      phone: plan.phone,
    });
    await send();
    const logs = await records();
    assert.equal(logs.length, 1);
    const events = logs[0].events;
    const attempts = events.filter(
      (event) => event.evento === 'intento_iniciado',
    );
    assert.equal(attempts.length, 2);
    assert.notEqual(attempts[0].intento, attempts[1].intento);
    for (const attempt of attempts) {
      const own = events.filter((event) => event.intento === attempt.intento);
      assert.ok(
        own.every(
          (event) =>
            event.telefono === attempt.telefono && event.lote === attempt.lote,
        ),
      );
      assert.ok(
        own.some(
          (event) => event.evento === 'resultado' && event.estado === 'enviado',
        ),
      );
    }
    assert.equal(events.at(-1).evento, 'lote_finalizado');
    assert.equal(events.at(-1).destinatarios.length, 2);
    assert.ok(
      events
        .at(-1)
        .destinatarios.every((contact) => contact.estado === 'enviado'),
    );
  }));

test('stopping before the first recipient leaves one batch log marking every contact unattempted', async () =>
  fixture(async ({ queue, send, records, sends }) => {
    let entered;
    const waiting = new Promise((resolve) => {
      entered = resolve;
    });
    queue.transport.lastEnd = () => queue.clock.now();
    queue.clock.wait = (_ms, signal) => {
      entered();
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('Stopped')), {
          once: true,
        }),
      );
    };
    const pending = send();
    await waiting;
    queue.stop();
    await pending;
    assert.equal(sends(), 0);
    const logs = await records();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].events.at(-1).estado, 'stopped');
    assert.ok(
      logs[0].events
        .at(-1)
        .destinatarios.every((contact) => contact.estado === 'no_intentado'),
    );
  }));

test('a later recipient error shares the same log and preserves the previous successful result', async () =>
  fixture(async ({ root, queue, archives, item, transport, send, records }) => {
    const plans = [
      { root, phone: '+12025550123' },
      { root, phone: '+12025550124' },
    ];
    queue.getPlans = () => ({ revision: 'review', plans });
    archives.review = async (plan) => ({ ...item, phone: plan.phone });
    transport.check = async (contact) => {
      if (contact.phone === plans[1].phone) throw new Error('SECRET');
    };
    await send();
    const logs = await records();
    assert.equal(logs.length, 1);
    const summary = logs[0].events.at(-1);
    assert.deepEqual(
      summary.destinatarios.map((contact) => contact.estado),
      ['enviado', 'failed'],
    );
    assert.equal(
      logs[0].events.find((event) => event.evento === 'error').telefono,
      plans[1].phone,
    );
    assert.equal(JSON.stringify(logs).includes('SECRET'), false);
  }));

test('a log creation failure stops before compression and sending', async () =>
  fixture(async ({ plan, archives, queue, send, sends }) => {
    plan.root = path.join(plan.root, 'missing');
    let compressed = false;
    archives.create = async () => {
      compressed = true;
    };
    await send();
    assert.equal(queue.state().status, 'failed');
    assert.match(queue.state().message, /información/u);
    assert.equal(compressed, false);
    assert.equal(sends(), 0);
  }));

test('log persistence failures before dispatch prevent sending; after dispatch they preserve uncertainty', async () =>
  fixture(async ({ logs, send, queue, sends }) => {
    const write = logs.write.bind(logs);
    logs.write = (id, event, ...args) => {
      if (event === 'envio_iniciado') throw new LogError();
      return write(id, event, ...args);
    };
    await send();
    assert.equal(sends(), 0);
    assert.equal(queue.state().status, 'failed');
    logs.write = (id, event, ...args) => {
      if (event === 'resultado') throw new LogError();
      return write(id, event, ...args);
    };
    await send();
    assert.equal(sends(), 1);
    assert.equal(queue.state().status, 'uncertain');
  }));

test('symlink replacement cannot append into another file', async (t) =>
  fixture(async ({ logs, root, item }) => {
    const review = {
      mode: 'simulation',
      account: 'LOCAL',
      intervalSeconds: 10,
    };
    const name = logs.begin('attempt', {
      root,
      item,
      review,
      now: 100000,
      batchId: 'batch',
    });
    const outside = path.join(root, 'other.txt');
    await fs.writeFile(outside, 'untouched');
    await fs.unlink(path.join(root, name));
    try {
      await fs.symlink(outside, path.join(root, name));
    } catch (error) {
      if (error.code === 'EPERM') {
        t.skip('Symlinks unavailable');
        return;
      }
      throw error;
    }
    assert.throws(() => logs.write('attempt', 'resultado'), LogError);
    assert.equal(await fs.readFile(outside, 'utf8'), 'untouched');
  }));

test('uncertain results and their explicit review are appended to the same log without retrying', async () =>
  fixture(async ({ transport, send, queue, history, records }) => {
    let attempts = 0;
    transport.send = async () => {
      attempts++;
      throw new Error('SECRET_TRANSPORT_DETAILS');
    };
    await send();
    assert.equal(queue.state().status, 'uncertain');
    const attempt = history.page(0).rows[0];
    await queue.resolve(attempt.id, 'not-sent');
    const logs = await records();
    assert.equal(logs.length, 1);
    assert.equal(attempts, 1);
    assert.ok(
      logs[0].events.some(
        (event) => event.evento === 'error' && event.estado === 'uncertain',
      ),
    );
    assert.equal(logs[0].events.at(-1).evento, 'revision_manual');
    assert.equal(
      JSON.stringify(logs).includes('SECRET_TRANSPORT_DETAILS'),
      false,
    );
  }));

test('cleanup failure is recorded after a confirmed transport result and stops the batch', async () =>
  fixture(async ({ archives, send, queue, records }) => {
    let cleanups = 0;
    archives.clean = async () => {
      if (++cleanups > 1) throw new Error('cleanup failed');
    };
    await send();
    assert.equal(queue.state().status, 'failed');
    const log = (await records())[0];
    assert.ok(
      log.events.some(
        (event) => event.evento === 'resultado' && event.estado === 'enviado',
      ),
    );
    assert.ok(log.events.some((event) => event.codigo === 'CLEANUP'));
  }));

test('temporary duplicate state is discarded on restart and legacy database removal leaves sessions and logs intact', async () =>
  fixture(async ({ root, send, prepare, queue, item }) => {
    await send();
    await prepare();
    assert.equal(queue.review.items[0].risks.exact, true);
    const fresh = new BatchHistory(':memory:');
    try {
      assert.equal(
        fresh.risks('simulation', 'SIMULATED-LOCAL', item).exact,
        false,
      );
      assert.equal(fresh.page(0).total, 0);
    } finally {
      fresh.close();
    }
    for (const name of [
      'operations.sqlite',
      'operations.sqlite-journal',
      'viability.sqlite',
      'viability.sqlite-wal',
      'keep.log',
      'other.db',
    ])
      await fs.writeFile(path.join(root, name), 'fixture');
    await fs.mkdir(path.join(root, 'whatsapp-session'));
    await fs.writeFile(
      path.join(root, 'whatsapp-session', 'keep.txt'),
      'session',
    );
    await removeLegacyHistory(root);
    const names = await fs.readdir(root);
    assert.equal(
      names.some(
        (name) =>
          name.startsWith('operations.sqlite') ||
          name.startsWith('viability.sqlite'),
      ),
      false,
    );
    assert.ok(names.includes('keep.log'));
    assert.ok(names.includes('other.db'));
    assert.equal(
      await fs.readFile(
        path.join(root, 'whatsapp-session', 'keep.txt'),
        'utf8',
      ),
      'session',
    );
  }));
