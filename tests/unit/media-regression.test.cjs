'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  patchSource,
  INSERTION,
  unpatchSource,
} = require('../../scripts/patch-whatsapp.cjs');
const {
  SendFailure,
  classifySendFailure,
} = require('../../src/domain/send-failure.cjs');

const source = readFileSync(
  path.join(
    path.dirname(require.resolve('whatsapp-web.js/package.json')),
    'src/util/Injected/Utils.js',
  ),
  'utf8',
);
const original = unpatchSource(source);

async function constructMediaMessage(
  source,
  isLid = false,
  leakedId,
  renamedKey = false,
  delayedLookups = 0,
) {
  let queued = 0;
  let outgoing;
  const self = { _serialized: isLid ? 'self@lid' : 'self@c.us' };
  class MsgKey {
    constructor(fields) {
      Object.assign(this, fields);
      if (renamedKey) this.$1 = 'new-real-message-key';
      else this._serialized = 'new-real-message-key';
    }
    static async newId() {
      return 'new-id';
    }
  }
  const modules = {
    WAWebChatGetters: {
      getIsNewsletter: () => false,
      getIsBroadcast: () => false,
    },
    WALinkify: { findLink: () => null },
    WAWebUserPrefsMeUser: {
      getMaybeMeLidUser: () => self,
      getMaybeMePnUser: () => self,
    },
    WAWebMsgKey: MsgKey,
    WAWebGetEphemeralFieldsMsgActionsUtils: { getEphemeralFields: () => ({}) },
    WAWebSendMsgChatAction: {
      addAndSendMsgToChat(_chat, message) {
        if (Object.hasOwn(message, '__x_id'))
          throw new Error('Data passed to getter must include an id property');
        assert.ok(message.id instanceof MsgKey);
        outgoing = message;
        queued++;
        return [Promise.resolve(), Promise.resolve()];
      },
    },
    WAWebCollections: {
      Msg: {
        get: (key) => {
          if (key !== 'new-real-message-key' || delayedLookups-- > 0)
            return undefined;
          return outgoing;
        },
      },
    },
  };
  const window = {
    require(name) {
      if (!Object.hasOwn(modules, name))
        throw new Error(`Unexpected module: ${name}`);
      return modules[name];
    },
  };
  const exports = {};
  vm.runInNewContext(source, { window, exports, setTimeout });
  exports.LoadUtils();
  window.WWebJS.processMediaData = async () => ({
    __x_id: leakedId,
    filehash: 'fixture-hash',
    toJSON: () => ({ type: 'document', mimetype: 'application/zip' }),
  });
  const chat = {
    id: {
      ...self,
      isLid: () => isLid,
      isGroup: () => false,
      isStatus: () => false,
    },
  };
  const result = await window.WWebJS.sendMessage(chat, '', {
    media: { mimetype: 'application/zip' },
    sendMediaAsDocument: true,
  });
  return { result, queued };
}

test('reproduces the upstream media-ID collision in the installed unpatched library', async () => {
  await assert.rejects(
    constructMediaMessage(original),
    /Data passed to getter/,
  );
});

test('the audited patch preserves the real message key for self-chat PN and LID media', async () => {
  for (const isLid of [false, true]) {
    for (const leakedId of ['media-id', undefined]) {
      const { result, queued } = await constructMediaMessage(
        patchSource(original),
        isLid,
        leakedId,
      );
      assert.equal(result.id._serialized, 'new-real-message-key');
      assert.equal(Object.hasOwn(result, '__x_id'), false);
      assert.equal(result.type, 'document');
      assert.equal(queued, 1);
    }
  }
});

test('patching is idempotent and rejects unexpected dependency source', () => {
  assert.equal(patchSource(patchSource(original)), patchSource(original));
  assert.throws(() => patchSource(original + '\n'), /fuente.*cambió/);
});

test('reproduces the sent-but-undefined result when WhatsApp renames the key getter', async () => {
  const mediaOnlyPatch = original.replace(
    "        // Bot's won't reply if canonicalUrl is set (linking)",
    INSERTION + "        // Bot's won't reply if canonicalUrl is set (linking)",
  );
  const { result, queued } = await constructMediaMessage(
    mediaOnlyPatch,
    false,
    'media-id',
    true,
  );
  assert.equal(queued, 1);
  assert.equal(result, undefined);
});

test('returns the exact outgoing message for renamed keys and delayed insertion without resending', async () => {
  const { result, queued } = await constructMediaMessage(
    patchSource(original),
    true,
    'media-id',
    true,
    2,
  );
  assert.equal(result.id.$1, 'new-real-message-key');
  assert.equal(queued, 1);
});

test('the adapter accepts both identifier formats and never invents an id', () => {
  const {
    serializedId,
  } = require('../../src/adapters/whatsapp/serialized-id.cjs');
  assert.equal(serializedId({ _serialized: 'exact-id' }), 'exact-id');
  assert.equal(serializedId({ $1: 'exact-id' }), 'exact-id');
  assert.equal(serializedId({ _serialized: '', $1: 'exact-id' }), 'exact-id');
  for (const value of [null, undefined, {}, { $1: 123 }, { _serialized: '' }])
    assert.equal(serializedId(value), null);
});

test('diagnostics cross process boundaries without raw numbers, tokens or paths', () => {
  const error = classifySendFailure(
    new Error(
      'Data passed to getter must include an id property /private/doc +12025550123 TOKEN=secret',
    ),
    { phase: 'send', mayHaveSent: true },
  );
  const serialized = JSON.stringify(error.toDiagnostic());
  assert.equal(error.code, 'MEDIA_ID_CONFLICT');
  assert.equal(serialized.includes('secret'), false);
  assert.equal(serialized.includes('12025550123'), false);
  assert.equal(serialized.includes('/private'), false);
  assert.equal(new SendFailure(JSON.parse(serialized)).code, error.code);
  assert.equal(
    new SendFailure({ code: 'raw SECRET', phase: 'raw SECRET' }).code,
    'UNKNOWN',
  );
});
