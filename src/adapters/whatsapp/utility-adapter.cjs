'use strict';

const { utilityProcess } = require('electron');
const path = require('node:path');
const { SendFailure } = require('../../domain/send-failure.cjs');

class UtilityAdapter {
  constructor(config) {
    this.config = config;
    this.pending = new Map();
    this.sequence = 0;
    this.onStateCallback = () => {};
    this.stateListeners = new Set();
    this.state = { status: 'idle', account: null, qr: null };
  }

  onState(callback) {
    this.onStateCallback = callback;
  }
  setState(state) {
    this.state = state;
    this.onStateCallback(state);
    for (const callback of this.stateListeners) callback(state);
  }
  addStateListener(callback) {
    this.stateListeners.add(callback);
    return () => this.stateListeners.delete(callback);
  }

  async start() {
    if (this.child) return;
    const child = utilityProcess.fork(path.join(__dirname, 'worker.cjs'), [], {
      stdio: 'ignore',
      serviceName: 'WA File Sender - WhatsApp',
    });
    this.child = child;
    child.on('message', (message) => {
      if (this.child !== child) return;
      if (message.type === 'state') this.setState(message.state);
      else if (message.type === 'reply') {
        const request = this.pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.pending.delete(message.id);
        if (message.ok) request.resolve(message.value);
        else if (message.diagnostic)
          request.reject(new SendFailure(message.diagnostic));
        else
          request.reject(
            new Error('La operación de WhatsApp no pudo completarse.'),
          );
      }
    });
    child.once('exit', () => {
      const wasCurrent = this.child === child;
      if (wasCurrent) this.child = null;
      for (const [id, request] of this.pending) {
        if (request.child !== child) continue;
        const { reject, timer } = request;
        clearTimeout(timer);
        reject(new Error('El proceso de WhatsApp se detuvo.'));
        this.pending.delete(id);
      }
      if (wasCurrent && this.state.status !== 'idle')
        this.setState({ status: 'error', account: null, qr: null });
    });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('exit', () =>
        reject(new Error('No se pudo iniciar el proceso de WhatsApp.')),
      );
    });
    await this.request('configure', this.config);
  }

  request(command, payload = null, timeout = 120000) {
    if (!this.child)
      return Promise.reject(new Error('WhatsApp no está iniciado.'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          command === 'send-document'
            ? new SendFailure({ code: 'TIMEOUT' })
            : new Error('WhatsApp no respondió a tiempo.'),
        );
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, child: this.child });
      this.child.postMessage({ id, command, payload });
    });
  }

  async connect() {
    await this.start();
    return this.request('connect');
  }
  checkNumber(phone) {
    return this.request('check-number', { phone });
  }
  sendDocument(zip, phone, account, message = '') {
    return this.request('send-document', { zip, phone, account, message });
  }
  async unlink() {
    await this.start();
    return this.request('unlink');
  }

  async stop() {
    if (this.stopping) return this.stopping;
    this.stopping = this.performStop();
    try {
      return await this.stopping;
    } finally {
      this.stopping = null;
    }
  }

  async performStop() {
    const child = this.child;
    if (!child) return;
    try {
      await this.request('stop', null, 15000);
    } finally {
      this.setState({ status: 'idle', account: null, qr: null });
      if (this.child === child) this.child = null;
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 3000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
        child.kill();
      });
    }
  }
}

module.exports = { UtilityAdapter };
