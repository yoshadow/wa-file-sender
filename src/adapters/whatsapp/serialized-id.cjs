'use strict';

function serializedId(value) {
  for (const candidate of [value?._serialized, value?.$1]) {
    if (
      typeof candidate === 'string' &&
      candidate.length > 0 &&
      candidate.length <= 500
    )
      return candidate;
  }
  return null;
}

module.exports = { serializedId };
