'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WhatsAppSession } = require('../../src/services/whatsapp-session.cjs');

function fixture(confirm = async () => true) {
  let emit;
  const calls = [];
  const adapter = {
    onState(callback) {
      emit = callback;
    },
    async connect() {
      calls.push('connect');
      emit({ status: 'qr', account: null, qr: 'fake-qr' });
    },
    async unlink() {
      calls.push('unlink');
      return { remoteRevoked: true };
    },
    async stop() {
      calls.push('stop');
    },
  };
  const session = new WhatsAppSession({ adapter, confirm });
  return { session, adapter, calls, emit: (state) => emit(state) };
}

test('linking immediately requests QR, propagates states and avoids duplicate connections', async () => {
  const { session, calls, emit } = fixture(() =>
    assert.fail('No link confirmation'),
  );
  assert.equal((await session.connect()).status, 'qr');
  await session.connect();
  assert.deepEqual(calls, ['connect']);
  emit({ status: 'ready', account: 'fake-account', qr: null });
  assert.equal(session.snapshot().account, 'fake-account');
  assert.equal(session.sendTest, undefined);
});

test('connection failures expose a safe error and allow explicit reconnect', async () => {
  const { session, adapter } = fixture();
  const connect = adapter.connect;
  adapter.connect = async () => {
    throw new Error('/private/SECRET');
  };
  await assert.rejects(session.connect(), /No se pudo iniciar WhatsApp/);
  assert.equal(session.snapshot().status, 'error');
  assert.equal(session.snapshot().busy, false);
  assert.equal(JSON.stringify(session.snapshot()).includes('SECRET'), false);
  adapter.connect = connect;
  assert.equal((await session.connect()).status, 'qr');
});

test('unlink requires confirmation and reports unsuccessful remote revocation', async () => {
  const { session, adapter, calls } = fixture(async () => false);
  await session.unlink();
  assert.deepEqual(calls, []);
  session.confirm = async (kind) => {
    assert.equal(kind, 'unlink');
    return true;
  };
  adapter.unlink = async () => ({ remoteRevoked: false });
  assert.match((await session.unlink()).lastResult, /revoca/);
  assert.equal(session.snapshot().status, 'idle');
});

test('shutdown while unlink confirmation is pending blocks late mutations and concurrent operations', async () => {
  let resolve;
  const { session, calls } = fixture(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = session.unlink();
  await Promise.resolve();
  await assert.rejects(session.connect(), /operación en curso/);
  const closing = session.shutdown();
  resolve(true);
  await Promise.all([pending, closing]);
  assert.deepEqual(calls, ['stop']);
  await assert.rejects(session.unlink(), /operación en curso/);
});
