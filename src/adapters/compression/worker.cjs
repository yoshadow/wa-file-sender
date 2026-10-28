'use strict';

const {
  CompressionSession,
} = require('../../services/compression/session.cjs');
const { safeCode } = require('../../domain/compression.cjs');
let session;
let busy = false;
process.parentPort.on('message', async ({ data }) => {
  const { id, command, payload } = data;
  if (command === 'cancel') {
    session?.cancel();
    return;
  }
  if (busy) {
    process.parentPort.postMessage({ id, ok: false, code: 'IO' });
    return;
  }
  try {
    busy = true;
    let value;
    if (command === 'configure' && !session) {
      session = new CompressionSession(payload.root);
      await session.reset();
    } else if (command === 'prepare') value = await session.prepare(payload);
    else if (command === 'generate')
      value = await session.generate(payload.token);
    else if (command === 'reset') await session.reset();
    else throw new Error('Unknown command');
    process.parentPort.postMessage({ id, ok: true, value });
  } catch (error) {
    process.parentPort.postMessage({ id, ok: false, code: safeCode(error) });
  } finally {
    busy = false;
  }
});
