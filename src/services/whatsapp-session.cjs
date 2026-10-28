'use strict';

const { UserError } = require('../domain/contact.cjs');

class WhatsAppSession {
  constructor({ adapter, confirm }) {
    this.adapter = adapter;
    this.confirm = confirm;
    this.busy = false;
    this.shuttingDown = false;
    this.session = { status: 'idle', account: null, qr: null };
    this.lastResult = null;
    adapter.onState((state) => {
      this.session = state;
    });
  }

  snapshot() {
    return {
      ...this.session,
      busy: this.busy,
      lastResult: this.lastResult,
    };
  }

  async exclusive(operation) {
    if (this.busy || this.shuttingDown)
      throw new UserError('Hay una operación en curso. Espera a que termine.');
    this.busy = true;
    this.inflight = Promise.resolve().then(operation);
    try {
      return await this.inflight;
    } finally {
      this.busy = false;
    }
  }

  connect() {
    return this.exclusive(async () => {
      if (
        ['ready', 'connecting', 'qr', 'authenticated'].includes(
          this.session.status,
        )
      )
        return this.snapshot();
      if (this.shuttingDown) return this.snapshot();
      this.session = { status: 'connecting', account: null, qr: null };
      try {
        await this.adapter.connect();
      } catch {
        this.session = { status: 'error', account: null, qr: null };
        throw new UserError(
          'No se pudo iniciar WhatsApp. Revisa la conexión y los requisitos del navegador.',
        );
      }
      return this.snapshot();
    });
  }

  unlink() {
    return this.exclusive(async () => {
      if (!(await this.confirm('unlink')) || this.shuttingDown)
        return this.snapshot();
      const result = await this.adapter.unlink();
      this.session = { status: 'idle', account: null, qr: null };
      this.lastResult =
        result?.remoteRevoked === false
          ? 'Sesión local eliminada. Verifica y revoca también este dispositivo desde WhatsApp en tu teléfono.'
          : 'Sesión desvinculada y eliminada de este equipo.';
      return this.snapshot();
    });
  }

  async shutdown() {
    this.shuttingDown = true;
    await this.adapter.stop();
    await this.inflight?.catch(() => {});
  }
}

module.exports = { WhatsAppSession };
