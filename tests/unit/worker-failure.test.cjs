'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readFile,
  mkdtemp,
  rm,
  readdir,
  mkdir,
  writeFile,
} = require('node:fs/promises');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { tmpdir } = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

for (const mode of ['failure', 'renamed-id'])
  test(`worker ${mode}: preserves exact outcomes through RPC without retrying, with cleanup owned by the compression session`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'wa-worker-test-'));
    const file = path.resolve(
      __dirname,
      '../../src/adapters/whatsapp/worker.cjs',
    );
    const load = createRequire(file);
    let handler;
    let sequence = 0;
    const waiting = new Map();
    let sends = 0;
    class FakeClient extends EventEmitter {
      constructor() {
        super();
        this.info = {
          wid:
            mode === 'renamed-id'
              ? { $1: '12025550123@c.us' }
              : { _serialized: '12025550123@c.us' },
        };
      }
      async initialize() {
        this.emit('ready');
      }
      async destroy() {}
      async getNumberId() {
        return mode === 'renamed-id'
          ? { $1: '12025550123@c.us' }
          : { _serialized: '12025550123@c.us' };
      }
      async sendMessage(_recipient, media, options) {
        sends++;
        assert.equal(media.mimetype, 'application/zip');
        assert.equal(options.sendMediaAsDocument, true);
        assert.equal(options.waitUntilMsgSent, true);
        if (mode === 'renamed-id')
          return { id: { $1: 'exact-outgoing-message-id' } };
        throw new Error(
          'Data passed to getter must include an id property /private/token SECRET +12025550123',
        );
      }
    }
    const parentPort = {
      on(_event, callback) {
        handler = callback;
      },
      postMessage(message) {
        if (message.type === 'reply') {
          waiting.get(message.id)(message);
          waiting.delete(message.id);
        }
      },
    };
    function rpc(command, payload) {
      const id = ++sequence;
      return new Promise((resolve) => {
        waiting.set(id, resolve);
        handler({ data: { id, command, payload } });
      });
    }
    try {
      vm.runInNewContext(await readFile(file, 'utf8'), {
        process: { umask() {}, parentPort },
        Buffer,
        require(name) {
          if (name === 'whatsapp-web.js')
            return {
              Client: FakeClient,
              LocalAuth: class {},
              MessageMedia: load('whatsapp-web.js').MessageMedia,
            };
          return load(name);
        },
      });
      assert.equal(
        (
          await rpc('configure', {
            mock: false,
            documentRoot: path.join(root, 'zips'),
            authRoot: path.join(root, 'auth'),
          })
        ).ok,
        true,
      );
      assert.equal((await rpc('connect')).ok, true);
      const {
        scanDirectory,
      } = require('../../src/services/files/scan-directory.cjs');
      const {
        CompressionSession,
      } = require('../../src/services/compression/session.cjs');
      const source = path.join(root, 'source');
      await mkdir(path.join(source, 'Contacto'), { recursive: true });
      await writeFile(
        path.join(source, 'Contacto', 'Documento.txt'),
        'Texto ficticio',
      );
      const compression = new CompressionSession(path.join(root, 'zips'));
      const review = await compression.prepare({
        root: source,
        folderName: 'Contacto',
        contactName: 'Contacto',
        rowId: 'contacto',
        revision: 'revision',
        phone: '+12025550123',
        files: (await scanDirectory(source)).folders[0].files,
      });
      const zip = await compression.generate(review.token);
      const reply = await rpc('send-document', {
        zip,
        phone: '+12025550123',
        account: '12025550123@c.us',
      });
      if (mode === 'failure') {
        assert.equal(reply.ok, false);
        assert.equal(reply.diagnostic.code, 'MEDIA_ID_CONFLICT');
        assert.equal(reply.diagnostic.phase, 'send');
        assert.equal(reply.diagnostic.mayHaveSent, true);
      } else {
        assert.equal(reply.ok, true);
        assert.equal(reply.value.messageId, 'exact-outgoing-message-id');
      }
      assert.equal(JSON.stringify(reply).includes('SECRET'), false);
      assert.equal(JSON.stringify(reply).includes('12025550123'), false);
      await compression.reset();
      assert.deepEqual(await readdir(path.join(root, 'zips')), []);
      assert.equal(sends, 1);
      await rpc('stop');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
