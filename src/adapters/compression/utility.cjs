'use strict';

const { utilityProcess } = require('electron');
const path = require('node:path');
const { CompressionError } = require('../../domain/compression.cjs');

class CompressionUtility {
  constructor(root) {
    this.root = root;
    this.pending = new Map();
    this.sequence = 0;
  }
  async start() {
    const child = utilityProcess.fork(path.join(__dirname, 'worker.cjs'), [], {
      stdio: 'ignore',
      serviceName: 'WA File Sender - ZIP',
    });
    this.child = child;
    child.on('message', (message) => {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.value);
      else pending.reject(new CompressionError(message.code));
    });
    child.once('exit', () => {
      this.child = null;
      for (const pending of this.pending.values())
        pending.reject(new CompressionError('IO'));
      this.pending.clear();
    });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('exit', () => reject(new CompressionError('IO')));
    });
    return this.request('configure', { root: this.root });
  }
  request(command, payload) {
    if (!this.child) return Promise.reject(new CompressionError('IO'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      this.child.postMessage({ id, command, payload });
    });
  }
  cancel() {
    this.child?.postMessage({ command: 'cancel' });
  }
  async stop() {
    const child = this.child;
    if (!child) return;
    await new Promise((resolve) => {
      child.once('exit', resolve);
      child.kill();
    });
  }
}
module.exports = { CompressionUtility };
