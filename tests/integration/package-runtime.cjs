'use strict';

const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  readFile,
  readdir,
  realpath,
} = require('node:fs/promises');
const { readZip } = require('../helpers/read-zip.cjs');
const { tmpdir } = require('node:os');
const path = require('node:path');

async function main() {
  const resources = process.argv[2];
  const appPath = path.join(resources, 'app.asar');
  const load = createRequire(path.join(appPath, 'package.json'));
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), 'wa-package-check-')),
  );
  try {
    const metadata = load('./package.json');
    assert.equal(metadata.version, require('../../package.json').version);
    assert.equal(metadata.author.name, 'Isaac Avalos');
    assert.equal(metadata.license, 'GPL-3.0-only');
    assert.match(
      await readFile(path.join(appPath, 'LICENSE'), 'utf8'),
      /Version 3, 29 June 2007/,
    );
    const icon = await readFile(path.join(appPath, 'assets/icon.png'));
    assert.deepEqual(
      icon.subarray(0, 8),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    const { translate } = load('./src/renderer/translations.js');
    assert.equal(translate('en', 'Confirmar y enviar'), 'Confirm and send');
    const { parseContactsCsv } = load('./src/services/contacts/parse-csv.cjs');
    const contacts = parseContactsCsv(
      Buffer.from('nombre,telefono\nAna Pérez,+12025550123\n'),
    );
    assert.equal(contacts.validCount, 1);
    assert.equal(contacts.rows[0].normalizedPhone, '+12025550123');
    const { scanDirectory } = load('./src/services/files/scan-directory.cjs');
    const { PreviewService } = load('./src/services/files/preview.cjs');
    const fixtureRoot = path.join(root, 'carpetas');
    await mkdir(path.join(fixtureRoot, 'Ana Pérez'), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, 'Ana Pérez', 'Prueba.txt'),
      'Texto ficticio',
    );
    const preview = new PreviewService({
      selectDirectory: async () => fixtureRoot,
      scan: scanDirectory,
    });
    preview.setContacts(contacts);
    const previewState = await preview.selectRoot();
    assert.equal(previewState.eligibleCount, 1);
    assert.equal(
      preview.select({
        revision: previewState.revision,
        id: previewState.rows[0].id,
        selected: true,
      }).selectedFileCount,
      1,
    );
    const { CompressionSession } = load(
      './src/services/compression/session.cjs',
    );
    const documentRoot = path.join(root, 'document-zips');
    const compression = new CompressionSession(documentRoot);
    const prepared = await compression.prepare(
      preview.compressionPlan({
        id: previewState.rows[0].id,
        revision: preview.snapshot().revision,
      }),
    );
    const documentZip = await compression.generate(prepared.token);
    assert.equal(
      readZip(await readFile(documentZip.file))
        .get('Prueba.txt')
        .toString(),
      'Texto ficticio',
    );
    const { sendDocument } = load('./src/adapters/whatsapp/send-document.cjs');
    const { MessageMedia } = load('whatsapp-web.js');
    let dispatched = 0;
    const result = await sendDocument(
      { zip: documentZip, phone: '+12025550123', account: 'FAKE-SENDER' },
      {
        root: documentRoot,
        MessageMedia,
        assertReady: (account) => assert.equal(account, 'FAKE-SENDER'),
        client: {
          getNumberId: async () => ({ _serialized: '12025550123@c.us' }),
          sendMessage: async (_recipient, media, options) => {
            dispatched++;
            assert.equal(options.sendMediaAsDocument, true);
            assert.equal(media.filename, 'Ana Pérez.zip');
            assert.equal(
              readZip(Buffer.from(media.data, 'base64'))
                .get('Prueba.txt')
                .toString(),
              'Texto ficticio',
            );
            return { id: { _serialized: 'PACKAGED-FAKE-RECEIPT' } };
          },
        },
      },
    );
    assert.equal(dispatched, 1);
    assert.equal(result.messageId, 'PACKAGED-FAKE-RECEIPT');
    await compression.reset();
    assert.deepEqual(await readdir(documentRoot), []);
    const { BatchHistory } = load('./src/adapters/storage/batch-history.cjs');
    const { BatchQueue } = load('./src/services/queue/batch-queue.cjs');
    const { QueueArchives } = load(
      './src/adapters/compression/queue-archives.cjs',
    );
    const {
      SimulatedTransport,
    } = require('../helpers/simulated-transport.cjs');
    const batchHistory = new BatchHistory(path.join(root, 'operations.sqlite'));
    try {
      const queue = new BatchQueue({
        archives: new QueueArchives({
          request: (command, payload) =>
            command === 'prepare'
              ? compression.prepare(payload)
              : command === 'generate'
                ? compression.generate(payload.token)
                : compression.reset(),
        }),
        history: batchHistory,
        transport: new SimulatedTransport(),
        getPlans: (revision) => preview.batchPlans(revision),
        confirm: async () => true,
      });
      await queue.prepare({
        revision: preview.snapshot().revision,
        intervalSeconds: 10,
        outcome: 'success',
      });
      await queue.start(queue.review.id);
      await queue.pending;
      assert.equal(queue.state().status, 'completed');
      assert.equal(batchHistory.page(0).rows[0].mode, 'simulation');
      assert.equal(batchHistory.page(0).rows[0].status, 'sent');
      assert.deepEqual(await readdir(documentRoot), []);
    } finally {
      batchHistory.close();
    }
    const { browserPath } = load('./src/adapters/whatsapp/browser-path.cjs');
    const executable = browserPath({
      packaged: true,
      resourcesPath: resources,
      appPath,
    });
    const puppeteer = load('puppeteer');
    const { Client } = load('whatsapp-web.js');
    assert.match(
      load('whatsapp-web.js/src/util/Injected/Utils.js').LoadUtils.toString(),
      /delete message\.__x_id/,
    );
    assert.match(
      load('whatsapp-web.js/src/util/Injected/Utils.js').LoadUtils.toString(),
      /newMsgKey\.\$1/,
    );
    assert.equal(typeof new Client().initialize, 'function');
    const browser = await puppeteer.launch({
      executablePath: executable,
      headless: true,
      pipe: true,
      args: [],
    });
    try {
      const page = await browser.newPage();
      await page.goto('about:blank');
      assert.equal(
        await page.evaluate(() => typeof globalThis.require),
        'undefined',
      );
    } finally {
      await browser.close();
    }
    console.log('WA_PACKAGE_RUNTIME_OK');
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
