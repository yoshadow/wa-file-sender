'use strict';
const { CompressionError } = require('../../domain/compression.cjs');
class QueueArchives {
  constructor(utility) {
    this.utility = utility;
  }
  review(plan) {
    return this.utility.request('prepare', plan);
  }
  async create(plan, approved) {
    const current = await this.review(plan);
    if (current.bundleHash !== approved.bundleHash)
      throw new CompressionError('CHANGED');
    return this.utility.request('generate', { token: current.token });
  }
  clean() {
    return this.utility.request('reset');
  }
  cancel() {
    this.utility.cancel();
  }
}
module.exports = { QueueArchives };
