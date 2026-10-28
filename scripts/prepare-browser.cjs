'use strict';

const { cp, mkdir, rm, writeFile } = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const puppeteer = require('puppeteer');
  const executable = await puppeteer.executablePath();
  const destination = path.resolve(__dirname, '../.cache/bundled-browser');
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(path.dirname(executable), destination, { recursive: true });
  await writeFile(
    path.join(destination, 'manifest.json'),
    JSON.stringify(
      {
        executable: path.basename(executable),
        platform: process.platform,
        arch: process.arch,
        puppeteer: require('puppeteer/package.json').version,
        chrome: puppeteer.PUPPETEER_REVISIONS.chrome,
      },
      null,
      2,
    ),
  );
  console.log('Navegador compatible preparado para empaquetar.');
}

main().catch(() => {
  console.error(
    'No se pudo preparar el navegador. Ejecuta npm ci con conexión.',
  );
  process.exitCode = 1;
});
