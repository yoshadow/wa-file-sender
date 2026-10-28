'use strict';

const { randomUUID } = require('node:crypto');
const { prepareManifest } = require('./verified-files.cjs');
const { cleanDocumentZips, createDocumentZip } = require('./document-zip.cjs');
const { CompressionError, safeCode } = require('../../domain/compression.cjs');

// Lives in a utility process. Exactly one prepared recipient and one temporary ZIP.
class CompressionSession {
  constructor(root) {
    this.root = root;
    this.prepared = null;
    this.zip = null;
    this.controller = null;
  }
  async reset() {
    if (this.controller) throw new CompressionError('IO');
    this.prepared = null;
    this.zip = null;
    await cleanDocumentZips(this.root);
  }
  cancel() {
    this.cancelRequested = true;
    this.controller?.abort();
  }
  async run(operation) {
    if (this.controller) throw new CompressionError('IO');
    this.controller = new AbortController();
    if (this.cancelRequested) this.controller.abort();
    try {
      return await operation(this.controller.signal);
    } catch (error) {
      this.prepared = null;
      this.zip = null;
      throw new CompressionError(safeCode(error));
    } finally {
      this.controller = null;
    }
  }
  async prepare(plan) {
    this.cancelRequested = false;
    await this.reset();
    return this.run(async (signal) => {
      this.prepared = await prepareManifest(plan, signal);
      this.prepared.token = randomUUID();
      return {
        token: this.prepared.token,
        revision: plan.revision,
        rowId: plan.rowId,
        contactName: plan.contactName,
        phone: plan.phone,
        name: this.prepared.zipName,
        files: this.prepared.manifest,
        bundleHash: this.prepared.bundleHash,
        totalBytes: this.prepared.totalBytes,
      };
    });
  }
  async generate(token) {
    this.cancelRequested = false;
    if (!this.prepared || this.prepared.token !== token || this.zip)
      throw new CompressionError('CHANGED');
    return this.run(async (signal) => {
      this.zip = await createDocumentZip(this.root, this.prepared, signal);
      return { ...this.zip };
    });
  }
}
module.exports = { CompressionSession };
