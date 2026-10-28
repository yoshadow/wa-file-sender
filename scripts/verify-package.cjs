'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const directory = path.resolve(
  __dirname,
  '..',
  process.argv[2] || 'dist',
  process.platform === 'win32' ? 'win-unpacked' : 'linux-unpacked',
);
const executable = path.join(
  directory,
  process.platform === 'win32' ? 'WA File Sender.exe' : 'wa-file-sender',
);
const resources = path.join(directory, 'resources');
const child = spawn(
  executable,
  [
    path.resolve(__dirname, '../tests/integration/package-runtime.cjs'),
    resources,
  ],
  {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
child.stdout.on('data', (data) => {
  output += data;
});
child.stderr.on('data', (data) => {
  output += data;
});
const timeout = setTimeout(() => child.kill(), 60000);
child.once('error', () => {
  clearTimeout(timeout);
  console.error('No se pudo abrir el paquete. Ejecuta npm run build:dir.');
  process.exitCode = 1;
});
child.once('close', (code) => {
  clearTimeout(timeout);
  const complete = code === 0 && output.includes('WA_PACKAGE_RUNTIME_OK');
  if (complete)
    console.log(
      'Paquete: CSV, ZIP sin contraseña, adaptador de documentos con cliente ficticio, cola simulada, registros de prueba, limpieza, SQLite, módulos ASAR y navegador incluido verificados. Sin conexión a WhatsApp ni mensajes reales.',
    );
  else {
    console.error(output);
    process.exitCode = 1;
  }
});
