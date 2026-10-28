'use strict';
const fs = require('node:fs');
const path = require('node:path');

function distributionMetadata(root, { release = false } = {}) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const lock = JSON.parse(
    fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'),
  );
  if (!/^\d+\.\d+\.\d+-beta\.\d+$/u.test(pkg.version))
    throw new Error('Prepara una versión beta explícita antes de distribuir.');
  if (
    lock.version !== pkg.version ||
    lock.packages?.['']?.version !== pkg.version
  )
    throw new Error(
      'La versión de package.json y package-lock.json debe coincidir.',
    );
  if (!pkg.author?.name?.trim()) throw new Error('Falta el nombre del autor.');
  for (const name of ['icon.svg', 'icon.png', 'icon.ico']) {
    if (!fs.statSync(path.join(root, 'assets', name)).isFile())
      throw new Error(`Falta el icono ${name}.`);
  }
  const licenseReady = Boolean(
    pkg.license &&
    pkg.license !== 'UNLICENSED' &&
    fs.existsSync(path.join(root, 'LICENSE')) &&
    fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').trim(),
  );
  if (release && !licenseReady)
    throw new Error(
      'La licencia está pendiente. Define la licencia y su archivo LICENSE antes de crear una release.',
    );
  return { version: pkg.version, tag: `v${pkg.version}`, licenseReady };
}
if (require.main === module) {
  try {
    const metadata = distributionMetadata(path.resolve(__dirname, '..'), {
      release: process.argv.includes('--release'),
    });
    console.log(
      `Versión candidata: ${metadata.version}. Licencia: ${metadata.licenseReady ? 'definida' : 'pendiente; solo preparación interna'}.`,
    );
    if (process.env.GITHUB_OUTPUT)
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `version=${metadata.version}\ntag=${metadata.tag}\n`,
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { distributionMetadata };
