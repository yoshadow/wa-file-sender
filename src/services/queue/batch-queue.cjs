'use strict';
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { setTimeout: delay } = require('node:timers/promises');
const { UserError } = require('../../domain/contact.cjs');
const { CompressionError } = require('../../domain/compression.cjs');
const { SendFailure } = require('../../domain/send-failure.cjs');
const { LogError } = require('../../adapters/storage/attempt-logs.cjs');
const { validateQueuePrepare } = require('../../domain/queue.cjs');

const realClock = {
  now: () => Date.now(),
  mono: () => performance.now(),
  wait: (ms, signal) => delay(ms, undefined, { signal }),
};
class BatchQueue {
  constructor({
    archives,
    history,
    transport,
    getPlans,
    confirm,
    logs,
    confirmStart = true,
    clock = realClock,
  }) {
    Object.assign(this, {
      archives,
      history,
      transport,
      getPlans,
      confirm,
      logs,
      confirmStart,
      clock,
    });
    this.status = 'idle';
    this.busy = false;
    this.review = null;
    this.completed = 0;
    this.total = 0;
    this.message = null;
    this.current = null;
    this.lastMono = null;
    this.intervalSeconds = 10;
    this.closing = false;
  }
  assertIdle() {
    if (this.busy || this.closing)
      throw new UserError(
        'Detén el lote y espera a que termine la operación en curso.',
      );
  }
  invalidate() {
    this.assertIdle();
    this.review = null;
    this.plans = null;
    this.status = 'idle';
    this.message = null;
    this.completed = 0;
    this.total = 0;
    this.current = null;
  }
  state() {
    const account = this.transport.state();
    return {
      status: this.status,
      batchId: this.batchId || null,
      busy: this.busy,
      stopping: this.busy && Boolean(this.stopped),
      mode: account.mode,
      account: account.account,
      ready: account.ready,
      whatsapp: this.transport.whatsappState?.() || {
        ready: false,
        account: null,
      },
      review: this.review,
      completed: this.completed,
      total: this.total,
      current: this.current || null,
      message: this.message,
      countdown:
        this.status === 'waiting' ? Math.ceil(this.remaining() / 1000) : 0,
    };
  }
  checkAccount(expected) {
    const current = this.transport.state();
    if (
      !current.ready ||
      current.mode !== expected.mode ||
      current.account !== expected.account
    )
      throw new UserError(
        'La cuenta o el transporte cambió. Vuelve a revisar el lote.',
      );
  }
  async prepare(config) {
    validateQueuePrepare([config]);
    this.assertIdle();
    this.review = null;
    this.plans = null;
    this.busy = true;
    this.status = 'preparing';
    this.completed = 0;
    this.total = 0;
    this.current = null;
    this.message = null;
    this.stopped = false;
    this.abort = new AbortController();
    const job = (async () => {
      try {
        const mode = config.mode || this.transport.state().mode;
        if (mode !== this.transport.state().mode)
          throw new UserError('El transporte no está disponible.');
        const source = this.getPlans(config.revision);
        this.total = source.plans.length;
        const account = this.transport.state();
        this.checkAccount(account);
        this.activeMode = account.mode;
        this.activeAccount = account.account;
        this.connectionFault = false;
        const items = [];
        for (const plan of source.plans) {
          this.abort.signal.throwIfAborted();
          const reviewed = await this.archives.review(plan);
          this.abort.signal.throwIfAborted();
          items.push({
            ...reviewed,
            risks: this.history.risks(account.mode, account.account, reviewed),
          });
        }
        await this.archives.clean();
        if (!items.length)
          throw new UserError('Marca archivos de al menos un destinatario.');
        this.getPlans(source.revision);
        this.checkAccount(account);
        this.plans = source.plans;
        this.review = {
          id: randomUUID(),
          revision: source.revision,
          mode: account.mode,
          account: account.account,
          intervalSeconds: config.intervalSeconds,
          outcome: config.outcome,
          message: config.message || '',
          items,
        };
        this.status = 'review';
      } catch (error) {
        this.status = this.connectionFault
          ? 'failed'
          : this.abort.signal.aborted
            ? 'stopped'
            : 'failed';
        this.message = this.connectionFault
          ? 'La cuenta o la conexión de WhatsApp cambió. Vuelve a vincular y revisar el lote.'
          : error instanceof UserError || error instanceof CompressionError
            ? error.message
            : 'No se pudo revisar el lote. Revisa la carpeta y vuelve a intentar.';
        try {
          await this.archives.clean();
        } catch {
          this.status = 'failed';
          this.message = new CompressionError('CLEANUP').message;
        }
      } finally {
        this.busy = false;
      }
      return this.state();
    })();
    this.pending = job;
    return job;
  }
  async start(id) {
    this.assertIdle();
    if (!this.review || this.review.id !== id)
      throw new UserError('Revisa de nuevo el lote antes de confirmarlo.');
    const review = this.review;
    this.busy = true;
    this.status = 'confirming';
    this.abort = new AbortController();
    this.stopped = false;
    // Schedule confirmation so pending always points at the active run, even
    // when no native prompt introduces an await.
    const confirmation = Promise.resolve().then(async () => {
      try {
        this.getPlans(review.revision);
        this.checkAccount(review);
        this.activeMode = review.mode;
        this.activeAccount = review.account;
        this.connectionFault = false;
        const risks = review.items.map((item) => ({
          ...item,
          risks: this.history.risks(review.mode, review.account, item),
        }));
        if (risks.some((item) => item.risks.blocked))
          throw new UserError(
            'Hay un resultado incierto pendiente para este destinatario. Revisa el chat y el resultado del destinatario antes de continuar.',
          );
        if (
          risks.some((item) => item.risks.exact) &&
          !(await this.confirm('queue-repeat', { ...review, items: risks }))
        ) {
          this.status = 'review';
          return;
        }
        if (
          risks.some((item) => item.risks.repeatedFiles.length) &&
          !(await this.confirm('queue-files', { ...review, items: risks }))
        ) {
          this.status = 'review';
          return;
        }
        if (this.confirmStart && !(await this.confirm('queue-start', review))) {
          this.status = 'review';
          return;
        }
        if (this.stopped || this.closing) {
          this.status = 'stopped';
          return;
        }
        this.getPlans(review.revision);
        this.checkAccount(review);
        this.batchId = this.history.beginBatch(review, this.clock.now());
        this.review = null;
        this.intervalSeconds = review.intervalSeconds;
        this.completed = 0;
        this.total = review.items.length;
        this.message = null;
        // Return the start response immediately; stop/status IPC remain available during the run.
        this.status = 'running';
        const job = this.run(review);
        this.pending = job;
        job.catch(() => {});
        return 'started';
      } catch (error) {
        this.status = 'failed';
        this.message =
          error instanceof UserError
            ? error.message
            : 'No se pudo registrar o confirmar el lote. No se inició ningún envío.';
      }
    });
    this.pending = confirmation;
    const started = await confirmation;
    if (started !== 'started') {
      this.busy = false;
      if (this.stopped) this.status = 'stopped';
      if (this.connectionFault) {
        this.review = null;
        this.status = 'failed';
        this.message =
          'La sesión cambió durante la confirmación. Vuelve a revisar el lote.';
      }
    }
    return this.state();
  }
  remaining() {
    const account = this.transport.state();
    const lastEnd = Math.max(
      this.history.lastEnd(account.mode, account.account),
      this.transport.lastEnd?.() || 0,
    );
    const wall = lastEnd
      ? lastEnd + this.intervalSeconds * 1000 - this.clock.now()
      : 0;
    const monotonic =
      this.lastMono === null
        ? 0
        : this.lastMono + this.intervalSeconds * 1000 - this.clock.mono();
    return Math.max(0, wall, monotonic);
  }
  async wait() {
    while (this.remaining() > 0) {
      this.status = 'waiting';
      await this.clock.wait(this.remaining(), this.abort.signal);
    }
    this.abort.signal.throwIfAborted();
  }
  async run(review) {
    let batchStatus = 'completed';
    try {
      this.logs?.beginBatch(this.batchId, {
        root: this.plans[0].root,
        review,
        now: this.clock.now(),
      });
      for (let index = 0; index < review.items.length; index++) {
        const item = review.items[index];
        this.current = { name: item.contactName, phone: item.phone };
        await this.wait();
        this.checkAccount(review);
        this.abort.signal.throwIfAborted();
        const attemptId = this.history.beginAttempt(
          this.batchId,
          review,
          item,
          this.clock.now(),
        );
        let dispatched = false;
        let endedAt;
        let phase = 'compression';
        try {
          this.logs?.begin(attemptId, {
            root: this.plans[index].root,
            batchId: this.batchId,
            review,
            item,
            now: this.clock.now(),
          });
          this.status = 'compressing';
          const zip = await this.archives.create(this.plans[index], item);
          this.logs?.write(
            attemptId,
            'zip_generado',
            { nombre: zip.name, bytes: zip.size, sha256: zip.sha256 },
            this.clock.now(),
          );
          this.abort.signal.throwIfAborted();
          phase = 'preflight';
          this.status = 'checking';
          await this.transport.check(item, review.outcome);
          this.checkAccount(review);
          this.abort.signal.throwIfAborted();
          phase = 'storage';
          this.history.markSending(attemptId);
          this.logs?.write(attemptId, 'envio_iniciado', {}, this.clock.now());
          this.status = 'sending';
          phase = 'transport';
          dispatched = true;
          const result = await this.transport.send(
            zip,
            item,
            review.outcome,
            review.message,
          );
          endedAt = this.clock.now();
          this.lastMono = this.clock.mono();
          if (!result || typeof result.id !== 'string' || !result.id.length)
            throw new Error('No receipt');
          phase = 'storage';
          this.history.finishAttempt(
            attemptId,
            'sent',
            endedAt,
            result.id,
            null,
            true,
          );
          this.logs?.write(
            attemptId,
            'resultado',
            { estado: 'enviado', identificadorMensaje: result.id },
            endedAt,
          );
          this.completed++;
        } catch (error) {
          if (dispatched && endedAt === undefined) {
            endedAt = this.clock.now();
            this.lastMono = this.clock.mono();
          }
          const uncertain =
            dispatched &&
            !(error instanceof SendFailure && error.mayHaveSent === false);
          const status = uncertain
            ? 'uncertain'
            : this.stopped && !this.connectionFault
              ? 'cancelled'
              : 'failed';
          const code =
            this.connectionFault && !dispatched
              ? 'SESSION_CHANGED'
              : error instanceof CompressionError ||
                  error instanceof SendFailure ||
                  error instanceof LogError
                ? error.code
                : this.stopped && !dispatched
                  ? 'STOPPED'
                  : phase === 'preflight'
                    ? 'PREFLIGHT'
                    : phase === 'storage'
                      ? 'STORAGE'
                      : dispatched
                        ? 'TRANSPORT_UNCERTAIN'
                        : 'LOCAL_ERROR';
          try {
            this.history.finishAttempt(
              attemptId,
              status,
              endedAt ?? this.clock.now(),
              null,
              code,
              dispatched,
            );
          } catch {
            /* Keep the current attempt blocked if its in-memory result fails. */
          }
          batchStatus =
            status === 'uncertain'
              ? 'uncertain'
              : this.stopped
                ? 'stopped'
                : 'failed';
          this.message =
            this.connectionFault && !uncertain
              ? 'WhatsApp se desconectó o cambió de cuenta. El lote se detuvo antes de enviar este ZIP.'
              : error instanceof CompressionError ||
                  error instanceof LogError ||
                  (error instanceof SendFailure && !uncertain)
                ? error.message
                : uncertain
                  ? review.mode === 'whatsapp'
                    ? 'Resultado incierto. Revisa el chat antes de repetir; no hay reintentos automáticos.'
                    : 'Resultado incierto simulado. Revisa el resultado; no se reintentará automáticamente.'
                  : this.stopped
                    ? 'Lote detenido. No se inició el siguiente envío.'
                    : 'El lote se detuvo antes de enviar este ZIP.';
          if (error instanceof SendFailure)
            this.message += ` Código: ${error.code}.`;
          try {
            this.logs?.write(
              attemptId,
              'error',
              {
                estado: status,
                codigo: code,
                fase: phase,
                envioIniciado: dispatched,
                mensaje: this.message,
              },
              this.clock.now(),
            );
          } catch {
            this.message +=
              ' No se pudo guardar toda la información del envío. Revisa sus permisos y el espacio disponible.';
          }
          break;
        } finally {
          try {
            await this.archives.clean();
            if (this.logs?.name(attemptId))
              this.logs.write(
                attemptId,
                'limpieza',
                { estado: 'temporal_eliminado' },
                this.clock.now(),
              );
          } catch (error) {
            batchStatus = 'failed';
            this.message =
              error instanceof LogError
                ? error.message
                : new CompressionError('CLEANUP').message;
            try {
              this.logs?.write(
                attemptId,
                'error',
                {
                  codigo: error instanceof LogError ? error.code : 'CLEANUP',
                  fase: 'limpieza',
                  mensaje: this.message,
                },
                this.clock.now(),
              );
            } catch {
              /* The previous log entries remain available for inspection. */
            }
          }
        }
        if (batchStatus !== 'completed') break;
        if (this.stopped) {
          batchStatus = 'stopped';
          break;
        }
      }
    } catch (error) {
      batchStatus = this.stopped ? 'stopped' : 'failed';
      this.message =
        error instanceof LogError
          ? error.message
          : this.stopped
            ? 'Lote detenido. Revisa y confirma un nuevo lote para continuar.'
            : this.connectionFault
              ? 'WhatsApp se desconectó o cambió de cuenta. El lote se detuvo; revisa la sesión y el chat antes de volver a confirmar.'
              : 'No se pudo continuar el lote. Revisa el chat antes de repetir.';
      try {
        if (this.logs?.name(this.batchId))
          this.logs.write(
            this.batchId,
            'error',
            {
              codigo:
                error instanceof LogError
                  ? error.code
                  : this.stopped
                    ? 'STOPPED'
                    : this.connectionFault
                      ? 'SESSION_CHANGED'
                      : 'BATCH_ERROR',
              mensaje: this.message,
            },
            this.clock.now(),
          );
      } catch {
        /* The log may be unavailable after an I/O error. */
      }
    } finally {
      this.status = batchStatus;
      this.current = null;
      this.busy = false;
      try {
        if (this.logs?.name(this.batchId))
          this.logs.finishBatch(this.batchId, batchStatus, this.clock.now());
      } catch (error) {
        this.status = 'failed';
        this.message =
          error instanceof LogError ? error.message : new LogError().message;
      }
      try {
        this.history.finishBatch(this.batchId, this.status, this.clock.now());
      } catch {
        this.status = 'uncertain';
        this.message =
          'No se pudo registrar el resultado de esta sesión. Revisa el chat antes de repetir.';
      }
    }
  }
  stop() {
    if (this.busy) {
      this.stopped = true;
      this.message =
        'Detención solicitada. No puede retirarse un envío ya iniciado; no se iniciará el siguiente.';
      this.abort?.abort();
      if (this.status === 'preparing' || this.status === 'compressing')
        this.archives.cancel();
      if (this.status === 'checking') this.transport.interrupt?.();
    }
    return this.state();
  }
  async resolve(id, resolution) {
    this.assertIdle();
    const item = this.history.uncertain(id);
    if (!item) throw new UserError('El resultado ya no está pendiente.');
    this.busy = true;
    try {
      if (
        (await this.confirm('queue-resolve', { ...item, resolution })) &&
        !this.closing
      ) {
        this.logs?.write(
          id,
          'revision_manual',
          { resultado: resolution },
          this.clock.now(),
        );
        this.history.resolve(id, resolution, this.clock.now());
        this.review = null;
        this.status = 'idle';
        this.message = 'Revisión registrada. No se reanudó ningún lote.';
      }
    } finally {
      this.busy = false;
    }
    return this.state();
  }
  connectionChanged() {
    if (this.activeMode !== 'whatsapp') return;
    const state = this.transport.state();
    if (state.ready && state.account === this.activeAccount) return;
    if (!this.busy) {
      this.review = null;
      this.status = 'idle';
      this.message =
        'La sesión cambió. Vincula WhatsApp y vuelve a revisar el lote.';
      return;
    }
    if (this.connectionFault) return;
    this.connectionFault = true;
    this.abort?.abort();
    if (this.status === 'preparing' || this.status === 'compressing')
      this.archives.cancel();
    if (this.status === 'sending' || this.status === 'checking')
      this.transport.interrupt?.();
  }
  async shutdown() {
    this.closing = true;
    this.stop();
    let timer;
    try {
      await Promise.race([
        this.pending || Promise.resolve(),
        new Promise((resolve) => {
          timer = setTimeout(resolve, 5000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
module.exports = { BatchQueue, realClock };
