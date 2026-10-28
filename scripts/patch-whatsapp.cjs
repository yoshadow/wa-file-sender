'use strict';

const { readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');

// Minimal upstream media-ID fix: https://github.com/wwebjs/whatsapp-web.js/pull/201923
// Only the audited 1.34.7 source is accepted. Never silently patch another release.
const ORIGINAL_HASH =
  '0d0f88565f481dbfeb9493b04b24033a2cb60f5fd2fd0e84e543b461d98878fe';
const ANCHOR = "        // Bot's won't reply if canonicalUrl is set (linking)";
const INSERTION =
  '        // WA File Sender: upstream #201923; MediaData must not override the message key.\n        delete message.__x_id;\n\n';
const hash = (source) => createHash('sha256').update(source).digest('hex');
const ORIGINAL_LOOKUP =
  "        return window\n            .require('WAWebCollections')\n            .Msg.get(newMsgKey._serialized);";
const FIXED_LOOKUP = `        const collection = window.require('WAWebCollections').Msg;
        const serializedKey = newMsgKey._serialized || newMsgKey.$1;
        if (typeof serializedKey !== 'string' || !serializedKey) return undefined;
        let outgoing = collection.get(serializedKey);
        for (let attempt = 0; !outgoing && attempt < 30; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            outgoing = collection.get(serializedKey);
        }
        return outgoing;`;

function unpatchSource(source) {
  return source.replace(INSERTION, '').replace(FIXED_LOOKUP, ORIGINAL_LOOKUP);
}

function patchSource(source) {
  const original = unpatchSource(source);
  if (
    hash(original) !== ORIGINAL_HASH ||
    original.split(ANCHOR).length !== 2 ||
    original.split(ORIGINAL_LOOKUP).length !== 2
  )
    throw new Error(
      'La fuente de WhatsApp Web.js cambió; revisar el parche antes de continuar.',
    );
  return original
    .replace(ANCHOR, INSERTION + ANCHOR)
    .replace(ORIGINAL_LOOKUP, FIXED_LOOKUP);
}

function patchInstalled() {
  if (require('whatsapp-web.js/package.json').version !== '1.34.7')
    throw new Error(
      'Revisar el parche de medios para esta versión de WhatsApp Web.js.',
    );
  const file = path.join(
    path.dirname(require.resolve('whatsapp-web.js/package.json')),
    'src/util/Injected/Utils.js',
  );
  const original = readFileSync(file, 'utf8');
  const patched = patchSource(original);
  if (patched !== original) writeFileSync(file, patched);
}

if (require.main === module) {
  try {
    patchInstalled();
    console.log('Corrección de medios de WhatsApp Web.js verificada.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  patchSource,
  patchInstalled,
  unpatchSource,
  INSERTION,
  ORIGINAL_HASH,
};
