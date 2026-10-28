'use strict';
const { UserError } = require('./contact.cjs');
const MAX_MESSAGE_LENGTH = 1000;
function validateMessage(value) {
  if (
    typeof value !== 'string' ||
    value.length > MAX_MESSAGE_LENGTH ||
    [...value].some((character) => {
      const code = character.codePointAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })
  )
    throw new UserError(
      `El mensaje debe ser texto de hasta ${MAX_MESSAGE_LENGTH} caracteres.`,
    );
}
module.exports = { MAX_MESSAGE_LENGTH, validateMessage };
