'use strict';

const { spawn } = require('node:child_process');
const {
  mkdtemp,
  rm,
  copyFile,
  readdir,
  mkdir,
  writeFile,
  readFile,
} = require('node:fs/promises');
const assert = require('node:assert/strict');
const { tmpdir } = require('node:os');
const path = require('node:path');

async function main() {
  const profile = await mkdtemp(path.join(tmpdir(), 'wa-file-sender-smoke-'));
  await mkdir(path.join(profile, 'private'));
  for (const name of ['operations.sqlite', 'viability.sqlite'])
    await writeFile(
      path.join(profile, 'private', name),
      'obsolete fake history',
    );
  const env = { ...process.env, WA_FILE_SENDER_SMOKE_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE;
  const args = ['.', '--smoke-test'];
  if (process.argv.includes('--capture-preview'))
    args.push('--capture-preview');
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(require('electron'), args, {
        cwd: path.resolve(__dirname, '../..'),
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.on('data', (data) => {
        output += data;
      });
      child.stderr.on('data', (data) => {
        output += data;
      });
      const timeout = setTimeout(() => child.kill(), 60000);
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        resolve({ code, output });
      });
    });
    if (result.code !== 0 || !result.output.includes('WA_DESKTOP_SMOKE_OK')) {
      console.error(result.output);
      throw new Error('La verificación de escritorio falló.');
    }
    console.log(
      'Escritorio: cola, un log por lote con todos los contactos en la carpeta seleccionada, resultados solo en memoria, eliminación del historial anterior, confirmación, pausas, limpieza e IPC verificados. No se enviaron mensajes reales.',
    );
    assert.deepEqual(
      await readdir(path.join(profile, 'private/document-zips')),
      [],
    );
    assert.equal(
      (await readdir(path.join(profile, 'private'))).some((name) =>
        name.endsWith('.sqlite'),
      ),
      false,
    );
    const selectedRoot = path.join(profile, 'Compresion ficticia');
    const logs = (await readdir(selectedRoot)).filter((name) =>
      name.endsWith('.log'),
    );
    assert.ok(logs.length >= 2);
    const contents = await Promise.all(
      logs.map((name) => readFile(path.join(selectedRoot, name), 'utf8')),
    );
    assert.ok(
      contents.some((content) =>
        content.includes('SIMULATED-DOCUMENT-NOT-SENT'),
      ),
    );
    assert.ok(contents.some((content) => content.includes('"evento":"error"')));
    if (process.argv.includes('--capture-preview')) {
      const preview = path.join(tmpdir(), 'wa-file-sender-preview.png');
      await copyFile(path.join(profile, 'preview.png'), preview);
      console.log(`Vista previa: ${preview}`);
      const sidebarPreview = path.join(tmpdir(), 'wa-file-sender-sidebar.png');
      await copyFile(path.join(profile, 'sidebar-preview.png'), sidebarPreview);
      console.log(`Vista previa de vinculación: ${sidebarPreview}`);
      const englishPreview = path.join(tmpdir(), 'wa-file-sender-english.png');
      await copyFile(path.join(profile, 'english-preview.png'), englishPreview);
      console.log(`English preview: ${englishPreview}`);
    }
  } finally {
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
