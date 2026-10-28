'use strict';

const { parsePhoneNumberFromString } = require('libphonenumber-js/max');

class UserError extends Error {}

function normalizePhone(value) {
  if (
    typeof value !== 'string' ||
    value.length > 40 ||
    !/^\+?[\d ()-]+$/.test(value.trim())
  ) {
    throw new UserError(
      'Introduce un teléfono con lada internacional. El signo + es opcional.',
    );
  }
  const trimmed = value.trim();
  const international = trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
  const phone = parsePhoneNumberFromString(international);
  if (!phone?.isValid())
    throw new UserError('El teléfono internacional no es válido.');
  return phone.number;
}

function normalizeName(value) {
  const name = value.normalize('NFC').trim();
  if (!name) throw new UserError('El nombre está vacío.');
  if (name.length > 200)
    throw new UserError('El nombre supera los 200 caracteres.');
  if (
    [...name].some(
      (character) =>
        character.codePointAt(0) < 32 || character.codePointAt(0) === 127,
    )
  )
    throw new UserError(
      'El nombre contiene saltos de línea o caracteres de control.',
    );
  return { name, key: name.toLocaleLowerCase('es').normalize('NFC') };
}

module.exports = { UserError, normalizePhone, normalizeName };
