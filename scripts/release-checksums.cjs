'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');

async function releaseChecksums(directory, version) {
  if (!/^\d+\.\d+\.\d+-beta\.\d+$/u.test(version))
    throw new Error('Versión de distribución no válida.');
  const names = [
    `WA-File-Sender-${version}-windows-x64.exe`,
    `WA-File-Sender-${version}-linux-x64.AppImage`,
  ];
  const lines = [];
  for (const name of names) {
    const file = path.join(directory, name);
    const info = await fs.lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size === 0)
      throw new Error(`Artefacto no válido: ${name}`);
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(file)) hash.update(bytes);
    lines.push(`${hash.digest('hex')}  ${name}`);
  }
  await fs.writeFile(
    path.join(directory, 'SHA256SUMS.txt'),
    lines.join('\n') + '\n',
  );
  return names;
}
if (require.main === module) {
  const pkg = require('../package.json');
  releaseChecksums(
    path.resolve(process.argv[2] || 'release-artifacts'),
    pkg.version,
  ).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { releaseChecksums };
