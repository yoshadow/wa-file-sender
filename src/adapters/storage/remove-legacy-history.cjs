'use strict';
const { unlink } = require('node:fs/promises');
const path = require('node:path');

async function removeLegacyHistory(privateRoot) {
  // Exact obsolete database names only. Never touch WhatsApp sessions or logs.
  for (const name of ['operations.sqlite', 'viability.sqlite'])
    for (const suffix of ['', '-journal', '-wal', '-shm'])
      try {
        await unlink(path.join(privateRoot, name + suffix));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
}
module.exports = { removeLegacyHistory };
