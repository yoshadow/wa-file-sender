'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  session,
  dialog,
} = require('electron');
const {
  readFile,
  writeFile,
  mkdir,
  chmod,
  realpath,
} = require('node:fs/promises');
const path = require('node:path');
const {
  APP_URL,
  CSP,
  resolveResource,
  handleTrustedRequest,
} = require('../shared/security.cjs');
const { UtilityAdapter } = require('../adapters/whatsapp/utility-adapter.cjs');
const { browserPath } = require('../adapters/whatsapp/browser-path.cjs');
const { WhatsAppSession } = require('../services/whatsapp-session.cjs');
const { ContactsService } = require('../services/contacts/import-contacts.cjs');
const { scanDirectory } = require('../services/files/scan-directory.cjs');
const { BatchHistory } = require('../adapters/storage/batch-history.cjs');
const { AttemptLogs } = require('../adapters/storage/attempt-logs.cjs');
const {
  removeLegacyHistory,
} = require('../adapters/storage/remove-legacy-history.cjs');
const { BatchQueue } = require('../services/queue/batch-queue.cjs');
const { QueueArchives } = require('../adapters/compression/queue-archives.cjs');
const { WhatsAppTransport } = require('../adapters/transport/whatsapp.cjs');
const {
  validateQueuePrepare,
  validateQueueStart,
  validateResolution,
} = require('../domain/queue.cjs');
const { CompressionUtility } = require('../adapters/compression/utility.cjs');
const {
  PreviewService,
  validateSelectionArguments,
} = require('../services/files/preview.cjs');
const {
  parseInUtility,
  closeContactParsers,
} = require('../adapters/contacts/utility-parser.cjs');
const { UserError } = require('../domain/contact.cjs');
const {
  LanguagePreference,
  validateLanguage,
} = require('../services/language-preference.cjs');
const { translate } = require('../renderer/translations.js');
let languagePreference;
const t = (source, ...values) =>
  translate(languagePreference?.language || 'es', source, ...values);
const { localizeDialog } = require('../shared/native-dialog.cjs');
const localizedDialog = (options) =>
  localizeDialog(languagePreference?.language || 'es', options);
const { CompressionError } = require('../domain/compression.cjs');

const smokeTest = !app.isPackaged && process.argv.includes('--smoke-test');
let mainWindow;
let whatsappSession;
let compression;
let queue;
let batchHistory;
const testTemplateSelections = [];
let shutdownStarted = false;
let shutdownDone = false;
const testConfirmations = [];
const testCsvSelections = [];
const testDirectorySelections = [];

app.setName('WA File Sender');

// Tests must not write into the user's real application profile.
if (smokeTest) {
  const { existsSync } = require('node:fs');
  const { tmpdir } = require('node:os');
  const profile = process.env.WA_FILE_SENDER_SMOKE_PROFILE;
  if (
    !profile ||
    path.dirname(profile) !== tmpdir() ||
    !path.basename(profile).startsWith('wa-file-sender-smoke-') ||
    !existsSync(profile)
  ) {
    throw new Error('Ejecuta la prueba con npm run test:desktop.');
  }
  app.setPath('userData', profile);
  app.setPath('sessionData', profile);
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true } },
]);
app.enableSandbox();

function createWindow() {
  const window = new BrowserWindow({
    title: 'WA File Sender',
    icon: path.join(__dirname, '../../assets/icon.png'),
    width: 1120,
    height: 850,
    minWidth: 800,
    minHeight: 620,
    backgroundColor: '#f5f7f6',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      devTools: !app.isPackaged,
    },
  });
  window.setMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-redirect', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) =>
    event.preventDefault(),
  );
  window.once('ready-to-show', () => {
    if (!smokeTest) window.show();
  });
  return window;
}

async function start() {
  languagePreference = new LanguagePreference(
    path.join(app.getPath('userData'), 'preferences.json'),
  );
  await languagePreference.load();
  let privateRoot = path.join(app.getPath('userData'), 'private');
  await mkdir(privateRoot, { recursive: true, mode: 0o700 });
  await chmod(privateRoot, 0o700);
  privateRoot = await realpath(privateRoot);
  await removeLegacyHistory(privateRoot);
  const adapter = new UtilityAdapter({
    authRoot: path.join(privateRoot, 'whatsapp-session'),
    documentRoot: path.join(privateRoot, 'document-zips'),
    executable: browserPath({
      packaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
      appPath: app.getAppPath(),
    }),
    mock: smokeTest,
  });
  whatsappSession = new WhatsAppSession({
    adapter,
    confirm: confirmOperation,
  });
  await adapter.start();
  const contacts = new ContactsService({
    parseBytes: parseInUtility,
    selectFile: async () => {
      if (smokeTest) return testCsvSelections.shift() || null;
      const selected = await dialog.showOpenDialog(
        mainWindow,
        localizedDialog({
          title: 'Seleccionar contactos CSV',
          buttonLabel: 'Importar',
          filters: [{ name: 'Contactos CSV (UTF-8)', extensions: ['csv'] }],
          properties: ['openFile', 'dontAddToRecent'],
        }),
      );
      return selected.canceled ? null : selected.filePaths[0] || null;
    },
  });
  const preview = new PreviewService({
    scan: scanDirectory,
    selectDirectory: async () => {
      if (smokeTest) return testDirectorySelections.shift() || null;
      const selected = await dialog.showOpenDialog(
        mainWindow,
        localizedDialog({
          title: 'Seleccionar carpeta principal',
          buttonLabel: 'Revisar carpeta',
          properties: ['openDirectory', 'dontAddToRecent'],
        }),
      );
      return selected.canceled ? null : selected.filePaths[0] || null;
    },
  });
  compression = new CompressionUtility(path.join(privateRoot, 'document-zips'));
  await compression.start();
  batchHistory = new BatchHistory(':memory:');
  const attemptLogs = new AttemptLogs();
  const sessionStartedAt = Date.now();
  let testOffset = 0;
  const queueClock = smokeTest
    ? {
        now: () => Date.now() + testOffset,
        mono: () => performance.now() + testOffset,
        wait: async (ms, signal) => {
          await require('node:timers/promises').setTimeout(50, undefined, {
            signal,
          });
          testOffset += ms;
        },
      }
    : undefined;
  queue = new BatchQueue({
    archives: new QueueArchives(compression),
    history: batchHistory,
    logs: attemptLogs,
    confirmStart: false,
    transport: new WhatsAppTransport(adapter, () =>
      Math.max(sessionStartedAt, batchHistory.latestEnd('whatsapp')),
    ),
    clock: queueClock,
    getPlans: (revision) => {
      if (contacts.busy || whatsappSession.busy || shutdownStarted)
        throw new UserError('Espera a que termine la operación actual.');
      return preview.batchPlans(revision);
    },
    confirm: confirmOperation,
  });
  adapter.addStateListener(() => queue.connectionChanged());
  const uiSession = session.defaultSession;
  uiSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  uiSession.setPermissionCheckHandler(() => false);
  uiSession.on('will-download', (event) => event.preventDefault());
  uiSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !resolveResource(details.url) });
  });
  protocol.handle('app', async (request) => {
    const resource = resolveResource(request.url);
    if (request.method !== 'GET' || !resource) {
      return new Response(t('Recurso no permitido.'), { status: 403 });
    }
    try {
      const body = await readFile(
        path.join(
          __dirname,
          resource.directory === 'assets' ? '../../assets' : '../renderer',
          resource.name,
        ),
      );
      return new Response(body, {
        headers: {
          'Content-Type': resource.type,
          'Content-Security-Policy': CSP,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      return new Response(t('Recurso no disponible.'), { status: 404 });
    }
  });

  ipcMain.handle(
    'app:get-info',
    handleTrustedRequest(
      () => mainWindow,
      () => ({
        name: app.getName(),
        version: app.getVersion(),
        platform: process.platform,
        simulated: smokeTest,
        language: languagePreference.language,
      }),
    ),
  );
  ipcMain.handle(
    'app:close',
    handleTrustedRequest(
      () => mainWindow,
      () => {
        // Let the IPC response reach the renderer before destroying the window.
        setImmediate(() => app.quit());
        return true;
      },
    ),
  );

  function registerOperation(channel, operation, validate) {
    ipcMain.handle(
      channel,
      handleTrustedRequest(
        () => mainWindow,
        async (...args) => {
          try {
            return { ok: true, state: await operation(...args) };
          } catch (error) {
            return {
              ok: false,
              error:
                error instanceof UserError || error instanceof CompressionError
                  ? error.message
                  : t(
                      'No se pudo completar la operación. Cierra la aplicación y revisa la sesión antes de reintentar.',
                    ),
            };
          }
        },
        validate,
      ),
    );
  }
  registerOperation(
    'app:set-language',
    async (language) => ({ language: await languagePreference.save(language) }),
    validateLanguage,
  );
  registerOperation('wa:get-state', () => whatsappSession.snapshot());
  registerOperation('wa:connect', () => {
    queue.invalidate();
    return whatsappSession.connect();
  });
  registerOperation('wa:unlink', () => {
    queue.invalidate();
    return whatsappSession.unlink();
  });
  registerOperation('contacts:get', () => contacts.snapshot());
  let templateSaving = false;
  registerOperation('contacts:template', async () => {
    if (templateSaving)
      throw new UserError('Espera a que termine el guardado de la plantilla.');
    queue.assertIdle();
    templateSaving = true;
    try {
      const testDestination = smokeTest ? testTemplateSelections.shift() : null;
      const selected = smokeTest
        ? testDestination
          ? { canceled: false, filePath: testDestination }
          : { canceled: true }
        : await dialog.showSaveDialog(
            mainWindow,
            localizedDialog({
              title: 'Guardar plantilla de contactos',
              buttonLabel: 'Guardar plantilla',
              defaultPath: path.join(
                app.getPath('documents'),
                'Plantilla-contactos.csv',
              ),
              filters: [{ name: 'Contactos CSV', extensions: ['csv'] }],
              properties: ['dontAddToRecent', 'showOverwriteConfirmation'],
            }),
          );
      if (selected.canceled || !selected.filePath) return { cancelled: true };
      try {
        await writeFile(selected.filePath, '\uFEFFnombre,telefono\r\n', {
          encoding: 'utf8',
          mode: 0o600,
        });
      } catch {
        throw new UserError(
          'No se pudo guardar la plantilla. Revisa los permisos de la carpeta e inténtalo de nuevo.',
        );
      }
      return { cancelled: false };
    } finally {
      templateSaving = false;
    }
  });
  registerOperation('contacts:select', async () => {
    queue.invalidate();
    preview.assertIdle();
    await compression.request('reset');
    const state = await contacts.selectCsv();
    if (!state.cancelled) preview.setContacts(state);
    return state;
  });
  registerOperation('contacts:clear', async () => {
    queue.invalidate();
    preview.assertIdle();
    await compression.request('reset');
    const state = contacts.clear();
    preview.setContacts(state);
    return state;
  });
  const requireContactsIdle = () => {
    if (contacts.busy)
      throw new UserError('Espera a que termine la importación del CSV.');
  };
  function syncSentContacts() {
    if (queue.busy || preview.busy || contacts.busy) return;
    preview.clearSentSelections(
      batchHistory.sentAttempts(
        'whatsapp',
        adapter.state.account || queue.activeAccount,
      ),
      adapter.state.account || queue.activeAccount,
    );
  }
  registerOperation('preview:get', () => {
    syncSentContacts();
    return preview.snapshot();
  });
  registerOperation('preview:select-root', async () => {
    queue.invalidate();
    requireContactsIdle();
    await compression.request('reset');
    return preview.selectRoot();
  });
  registerOperation('preview:clear', async () => {
    queue.invalidate();
    requireContactsIdle();
    await compression.request('reset');
    return preview.clear();
  });
  registerOperation(
    'preview:select-item',
    async (request) => {
      queue.invalidate();
      requireContactsIdle();
      await compression.request('reset');
      return preview.select(request);
    },
    validateSelectionArguments,
  );
  registerOperation('queue:get', () => {
    syncSentContacts();
    return queue.state();
  });
  registerOperation('queue:results', () =>
    batchHistory.sessionResults(
      'whatsapp',
      adapter.state.account || queue.activeAccount,
    ),
  );
  registerOperation(
    'queue:prepare',
    async (config) => {
      syncSentContacts();
      if (config.mode !== 'whatsapp' || config.outcome !== 'success')
        throw new UserError(
          'El envío debe realizarse mediante WhatsApp. Revisa la selección antes de continuar.',
        );
      queue.assertIdle();
      requireContactsIdle();
      preview.assertIdle();
      if (whatsappSession.busy)
        throw new UserError('Espera a que termine la operación de WhatsApp.');
      await compression.request('reset');
      return queue.prepare(config);
    },
    validateQueuePrepare,
  );
  registerOperation(
    'queue:start',
    (request) => {
      syncSentContacts();
      return queue.start(request.id);
    },
    validateQueueStart,
  );
  registerOperation('queue:stop', () => queue.stop());
  registerOperation(
    'queue:resolve',
    (request) => queue.resolve(request.id, request.resolution),
    validateResolution,
  );

  mainWindow = createWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  await mainWindow.loadURL(APP_URL);

  if (smokeTest) {
    await require('../../tests/integration/desktop-smoke.cjs').run({
      app,
      mainWindow,
      createWindow,
      APP_URL,
      adapter,
      testConfirmations,
      testCsvSelections,
      testTemplateSelections,
      testDirectorySelections,
      queue,
      batchHistory,
    });
  }
}

async function closeCompression() {
  if (!compression) return;
  compression.cancel();
  let timeout;
  try {
    await Promise.race([
      compression.request('reset'),
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Cleanup timeout')), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
    await compression.stop();
  }
}

async function confirmOperation(kind, data = {}) {
  if (smokeTest) {
    testConfirmations.push({ kind, ...data });
    return true;
  }
  const prompts = {
    'queue-repeat': {
      message: 'Hay conjuntos ya enviados por WhatsApp a estos destinatarios.',
      detail:
        'Repetir requiere autorización adicional y una nueva confirmación del lote. Revisa las coincidencias que aparecen en la vista previa.',
      accept: 'Autorizar reenvío',
    },
    'queue-files': {
      message:
        'Hay archivos ya enviados por WhatsApp dentro de conjuntos distintos.',
      detail:
        'Revisa los archivos repetidos en el lote. Confirma explícitamente su inclusión antes de la confirmación final.',
      accept: 'Incluir archivos repetidos',
    },
    'queue-resolve': {
      message: '¿Registrar tu revisión del chat de WhatsApp?',
      detail: t(
        'Cuenta: {0}\nDestinatario: {1}\nResultado revisado: {2}\nSe conserva el intento original y se registra esta decisión. No se reanudará ningún lote.',
        data.account,
        data.phone,
        data.resolution === 'sent'
          ? t('Comprobaste en el chat que se envió')
          : t('Comprobaste en el chat que no se envió'),
      ),
      accept: 'Registrar revisión',
    },
    unlink: {
      message: '¿Desvincular y eliminar la sesión local?',
      detail:
        'Se intentará cerrar la sesión en WhatsApp y se eliminarán sus datos locales. Si WhatsApp no responde, también puedes revocar el dispositivo desde tu teléfono.',
      accept: 'Desvincular',
    },
  };
  const prompt = prompts[kind];
  if (!prompt || !mainWindow || mainWindow.isDestroyed()) return false;
  const { response } = await dialog.showMessageBox(
    mainWindow,
    localizedDialog({
      type: 'question',
      title: 'WA File Sender',
      message: prompt.message,
      detail: prompt.detail,
      buttons: ['Cancelar', prompt.accept],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    }),
  );
  return response === 1;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (shutdownDone || !whatsappSession) return;
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    closeContactParsers();
    (async () => {
      await queue?.shutdown();
      return Promise.allSettled([
        whatsappSession.shutdown(),
        closeCompression(),
      ]);
    })()
      .then(async (results) => {
        if (results[1].status === 'rejected' && !smokeTest)
          await dialog.showMessageBox(
            localizedDialog({
              type: 'error',
              title: 'WA File Sender',
              message: 'No se pudo completar la limpieza del ZIP temporal.',
              detail:
                'Se volverá a intentar la limpieza al iniciar. Cierra los archivos abiertos antes de volver a usar la compresión.',
            }),
          );
      })
      .catch(() => {})
      .finally(() => {
        batchHistory?.close();
        shutdownDone = true;
        app.quit();
      });
  });
  app
    .whenReady()
    .then(start)
    .catch(() => {
      // Do not log paths, credentials or raw exception contents.
      console.error('No se pudo iniciar WA File Sender.');
      app.exit(1);
    });
}
