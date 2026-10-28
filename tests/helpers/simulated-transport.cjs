'use strict';
const { randomUUID } = require('node:crypto');
class SimulatedTransport {
  state() {
    return { ready: true, mode: 'simulation', account: 'SIMULATED-LOCAL' };
  }
  async check(_recipient, outcome) {
    if (outcome === 'failure') throw new Error('Simulated preflight failure');
  }
  async send(_zip, _recipient, outcome) {
    if (outcome === 'uncertain') throw new Error('Simulated uncertain result');
    return { id: `SIM-${randomUUID()}` };
  }
}
module.exports = { SimulatedTransport };
