'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
  distributionMetadata,
} = require('../../scripts/check-distribution.cjs');
const { releaseChecksums } = require('../../scripts/release-checksums.cjs');

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-distribution-test-'));
  const pkg = {
    version: '0.1.0-beta.1',
    author: { name: 'Test Author' },
    license: 'UNLICENSED',
  };
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
  fs.writeFileSync(
    path.join(root, 'package-lock.json'),
    JSON.stringify({
      version: pkg.version,
      packages: { '': { version: pkg.version } },
    }),
  );
  fs.mkdirSync(path.join(root, 'assets'));
  for (const icon of ['icon.svg', 'icon.png', 'icon.ico'])
    fs.writeFileSync(path.join(root, 'assets', icon), 'fixture');
  return Promise.resolve()
    .then(() => run(root, pkg))
    .finally(() => fs.rmSync(root, { recursive: true, force: true }));
}

test('distribution metadata allows internal preparation with pending license but refuses release creation', () =>
  fixture((root, pkg) => {
    assert.deepEqual(distributionMetadata(root), {
      version: pkg.version,
      tag: `v${pkg.version}`,
      licenseReady: false,
    });
    assert.throws(
      () => distributionMetadata(root, { release: true }),
      /licencia está pendiente/,
    );
    // Fictional license data only: no license choice is made for the real repository.
    pkg.license = 'TEST-ONLY';
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
    assert.throws(
      () => distributionMetadata(root, { release: true }),
      /licencia está pendiente/,
    );
    fs.writeFileSync(path.join(root, 'LICENSE'), 'Fictional license fixture');
    assert.equal(
      distributionMetadata(root, { release: true }).licenseReady,
      true,
    );
  }));

test('distribution refuses inconsistent lockfile versions and a missing author', () =>
  fixture((root, pkg) => {
    pkg.version = '0.1.0-beta.2';
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
    assert.throws(() => distributionMetadata(root), /debe coincidir/);
    pkg.version = '0.1.0-beta.1';
    pkg.author = {};
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg));
    assert.throws(() => distributionMetadata(root), /nombre del autor/);
  }));

test('checksums require both expected artifacts, hash actual bytes and exclude unrelated files', () =>
  fixture(async (root, pkg) => {
    const windows = `WA-File-Sender-${pkg.version}-windows-x64.exe`;
    const linux = `WA-File-Sender-${pkg.version}-linux-x64.AppImage`;
    const bytes = Buffer.from('Fictitious binary fixture, not a package');
    fs.writeFileSync(path.join(root, windows), bytes);
    await assert.rejects(releaseChecksums(root, pkg.version));
    assert.equal(fs.existsSync(path.join(root, 'SHA256SUMS.txt')), false);
    fs.writeFileSync(path.join(root, linux), bytes);
    fs.writeFileSync(path.join(root, 'private.log'), 'Do not include');
    assert.deepEqual(await releaseChecksums(root, pkg.version), [
      windows,
      linux,
    ]);
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert.equal(
      fs.readFileSync(path.join(root, 'SHA256SUMS.txt'), 'utf8'),
      `${digest}  ${windows}\n${digest}  ${linux}\n`,
    );
    fs.truncateSync(path.join(root, linux), 0);
    await assert.rejects(
      releaseChecksums(root, pkg.version),
      /Artefacto no válido/,
    );
    await assert.rejects(releaseChecksums(root, '../private'), /Versión/);
  }));
