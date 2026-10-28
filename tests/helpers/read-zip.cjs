'use strict';
const assert = require('node:assert/strict');
const { inflateRawSync } = require('node:zlib');
function readZip(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0);
  const result = new Map();
  let central = bytes.readUInt32LE(end + 16);
  for (let i = 0; i < bytes.readUInt16LE(end + 10); i++) {
    assert.equal(
      bytes.readUInt16LE(central + 8) & 1,
      0,
      'ZIP without encryption',
    );
    const nameLength = bytes.readUInt16LE(central + 28);
    const name = bytes
      .subarray(central + 46, central + 46 + nameLength)
      .toString('utf8');
    const local = bytes.readUInt32LE(central + 42);
    const start =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    const compressed = bytes.subarray(
      start,
      start + bytes.readUInt32LE(central + 20),
    );
    const method = bytes.readUInt16LE(central + 10);
    assert.ok(method === 0 || method === 8);
    result.set(
      name,
      method === 8 ? inflateRawSync(compressed) : Buffer.from(compressed),
    );
    central +=
      46 +
      nameLength +
      bytes.readUInt16LE(central + 30) +
      bytes.readUInt16LE(central + 32);
  }
  return result;
}
module.exports = { readZip };
