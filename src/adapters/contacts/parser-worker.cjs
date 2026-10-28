'use strict';

const {
  parseContactsCsv,
  invalidFile,
} = require('../../services/contacts/parse-csv.cjs');

process.parentPort.once('message', ({ data }) => {
  let result;
  try {
    result = parseContactsCsv(data.bytes);
  } catch {
    result = invalidFile(
      'VALIDATION_FAILED',
      'No se pudo validar el CSV. Revisa el formato del archivo.',
    );
  }
  process.parentPort.postMessage(result);
});
