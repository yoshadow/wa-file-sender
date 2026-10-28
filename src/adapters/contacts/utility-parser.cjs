'use strict';

const { utilityProcess } = require('electron');
const path = require('node:path');
const { UserError } = require('../../domain/contact.cjs');

const active = new Set();

function parseInUtility(bytes) {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(
      path.join(__dirname, 'parser-worker.cjs'),
      [],
      { stdio: 'ignore', serviceName: 'WA File Sender - CSV' },
    );
    active.add(child);
    let settled = false;
    const timer = setTimeout(
      () =>
        finish(
          new UserError(
            'La validación del CSV tardó demasiado. Divide el archivo y vuelve a intentar.',
          ),
        ),
      15000,
    );
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      active.delete(child);
      child.kill();
      if (error) reject(error);
      else resolve(result);
    }
    child.once('spawn', () => {
      if (!settled) child.postMessage({ bytes: new Uint8Array(bytes) });
    });
    child.once('message', (result) => finish(null, result));
    child.once('exit', () =>
      finish(
        new UserError(
          'La validación del CSV se interrumpió. Vuelve a seleccionar el archivo.',
        ),
      ),
    );
  });
}

function closeContactParsers() {
  for (const child of active) child.kill();
}

module.exports = { parseInUtility, closeContactParsers };
