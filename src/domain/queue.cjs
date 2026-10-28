'use strict';
const { UserError } = require('./contact.cjs');
const { validateMessage } = require('./message.cjs');
function fields(args, names) {
  const value = args[0];
  if (
    args.length !== 1 ||
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...names].sort().join(',')
  )
    throw new UserError('Solicitud de cola no válida.');
  return value;
}
function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 80;
}
function validateQueuePrepare(args) {
  const names = ['revision', 'intervalSeconds', 'outcome'];
  for (const optional of ['mode', 'message'])
    if (args[0] && Object.hasOwn(args[0], optional)) names.push(optional);
  const value = fields(args, names);
  validateMessage(Object.hasOwn(value, 'message') ? value.message : '');
  if (
    !identifier(value.revision) ||
    !Number.isInteger(value.intervalSeconds) ||
    value.intervalSeconds < 10 ||
    value.intervalSeconds > 3600 ||
    !['success', 'failure', 'uncertain'].includes(value.outcome) ||
    (Object.hasOwn(value, 'mode') &&
      !['simulation', 'whatsapp'].includes(value.mode)) ||
    (value.mode === 'whatsapp' && value.outcome !== 'success')
  )
    throw new UserError(
      'Revisa los datos del envío y usa una pausa entre 10 y 3600 segundos.',
    );
}
function validateQueueStart(args) {
  if (!identifier(fields(args, ['id']).id))
    throw new UserError('La revisión del lote no es válida.');
}
function validateResolution(args) {
  const value = fields(args, ['id', 'resolution']);
  if (!identifier(value.id) || !['sent', 'not-sent'].includes(value.resolution))
    throw new UserError('La revisión del resultado no es válida.');
}
module.exports = {
  validateQueuePrepare,
  validateQueueStart,
  validateResolution,
};
