'use strict';

const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');

function browserPath({ packaged, resourcesPath, appPath }) {
  const root = packaged
    ? path.join(resourcesPath, 'browser')
    : path.join(appPath, '.cache/bundled-browser');
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'manifest.json'), 'utf8'),
  );
  const expected = process.platform === 'win32' ? 'chrome.exe' : 'chrome';
  if (
    manifest.platform !== process.platform ||
    manifest.arch !== process.arch ||
    manifest.executable !== expected
  )
    throw new Error('Incompatible browser bundle');
  const executable = path.join(root, expected);
  if (!existsSync(executable)) throw new Error('Browser not installed');
  return executable;
}

module.exports = { browserPath };
