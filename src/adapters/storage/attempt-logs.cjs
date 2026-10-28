'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { UserError } = require('../../domain/contact.cjs');

class LogError extends UserError {
  constructor(code = 'LOG_WRITE') {
    super(
      'No se pudo guardar la información del envío en la carpeta principal. Revisa sus permisos y el espacio disponible. El lote se detuvo; comprueba el chat antes de repetir un envío iniciado.',
    );
    this.code = code;
  }
}

// Only the main process supplies roots from the reviewed selection. Logs are
// append-only JSON Lines text files; no contents, QR or session secrets enter them.
class AttemptLogs {
  constructor() {
    this.entries = new Map();
  }
  beginBatch(batchId, { root, review, now }) {
    if (this.entries.has(batchId)) throw new LogError('LOG_CREATE');
    let handle;
    try {
      const identity = fs.lstatSync(root);
      if (
        !identity.isDirectory() ||
        identity.isSymbolicLink() ||
        fs.realpathSync(root) !== root
      )
        throw new Error('Unsafe root');
      const name = `WA-File-Sender_${new Date(now).toISOString().replace(/[:.]/gu, '-')}_${randomUUID()}.log`;
      const file = path.join(root, name);
      handle = fs.openSync(
        file,
        fs.constants.O_WRONLY |
          fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          (fs.constants.O_NOFOLLOW || 0),
        0o600,
      );
      const fileIdentity = fs.fstatSync(handle);
      const checkedRoot = fs.lstatSync(root);
      if (
        checkedRoot.isSymbolicLink() ||
        checkedRoot.dev !== identity.dev ||
        checkedRoot.ino !== identity.ino ||
        fs.realpathSync(root) !== root
      )
        throw new Error('Changed root');
      const contacts = (review.items || []).map((item) => ({
        nombre: item.contactName,
        telefono: item.phone,
        zip: item.name,
        archivos: item.files.length,
      }));
      const ref = {
        root,
        name,
        file,
        identity,
        fileIdentity,
        batchId,
        contacts,
      };
      this.entries.set(batchId, ref);
      this.append(
        handle,
        'lote_iniciado',
        {
          lote: batchId,
          modo: review.mode,
          cuenta: review.account,
          destinatarios: contacts,
          intervaloSegundos: review.intervalSeconds,
          mensaje: review.message || '',
          aviso:
            'ZIP sin cifrado ni contraseña. Enviado no garantiza entrega ni lectura. Un envío iniciado sin resultado final debe revisarse en el chat; no se reintenta automáticamente.',
        },
        now,
      );
      return name;
    } catch {
      throw new LogError('LOG_CREATE');
    } finally {
      if (handle !== undefined) fs.closeSync(handle);
    }
  }
  begin(id, { root, batchId, review, item, now }) {
    if (!this.entries.has(batchId))
      this.beginBatch(batchId, {
        root,
        review: { ...review, items: review.items || [item] },
        now,
      });
    const batch = this.entries.get(batchId);
    if (batch.root !== root || this.entries.has(id))
      throw new LogError('LOG_CREATE');
    this.entries.set(id, {
      ...batch,
      attemptId: id,
      phone: item.phone,
      contactName: item.contactName,
      result: null,
    });
    this.write(
      id,
      'intento_iniciado',
      {
        modo: review.mode,
        cuenta: review.account,
        zip: item.name,
        archivos: item.files.map(({ name, size, sha256 }) => ({
          nombre: name,
          bytes: size,
          sha256,
        })),
        huellaConjunto: item.bundleHash,
      },
      now,
    );
    return batch.name;
  }
  finishBatch(batchId, status, now) {
    const batch = this.entries.get(batchId);
    if (!batch) throw new LogError();
    const attempts = [...this.entries.values()].filter(
      (entry) => entry.batchId === batchId && entry.attemptId,
    );
    this.write(
      batchId,
      'lote_finalizado',
      {
        estado: status,
        destinatarios: batch.contacts.map((contact) => {
          const attempt = attempts.find(
            (entry) => entry.phone === contact.telefono,
          );
          return {
            ...contact,
            intento: attempt?.attemptId || null,
            estado: attempt
              ? attempt.result || 'sin_resultado'
              : 'no_intentado',
          };
        }),
      },
      now,
    );
  }
  append(handle, event, data, now) {
    const bytes = Buffer.from(
      JSON.stringify({
        fecha: new Date(now).toISOString(),
        evento: event,
        ...data,
      }) + '\n',
    );
    let offset = 0;
    while (offset < bytes.length) {
      const written = fs.writeSync(
        handle,
        bytes,
        offset,
        bytes.length - offset,
      );
      if (!written) throw new Error('Short log write');
      offset += written;
    }
    fs.fsyncSync(handle);
  }
  write(id, event, data = {}, now = Date.now()) {
    let handle;
    try {
      const ref = this.entries.get(id);
      if (!ref) throw new Error('Unknown attempt');
      const root = fs.lstatSync(ref.root);
      const file = fs.lstatSync(ref.file);
      if (
        root.isSymbolicLink() ||
        !root.isDirectory() ||
        fs.realpathSync(ref.root) !== ref.root ||
        root.dev !== ref.identity.dev ||
        root.ino !== ref.identity.ino ||
        file.isSymbolicLink() ||
        !file.isFile()
      )
        throw new Error('Changed log path');
      handle = fs.openSync(
        ref.file,
        fs.constants.O_WRONLY |
          fs.constants.O_APPEND |
          (fs.constants.O_NOFOLLOW || 0) |
          (fs.constants.O_NONBLOCK || 0),
      );
      const opened = fs.fstatSync(handle);
      if (
        !opened.isFile() ||
        opened.dev !== ref.fileIdentity.dev ||
        opened.ino !== ref.fileIdentity.ino
      )
        throw new Error('Changed log');
      this.append(
        handle,
        event,
        {
          ...data,
          lote: ref.batchId,
          intento: ref.attemptId || null,
          ...(ref.attemptId
            ? { telefono: ref.phone, destinatario: ref.contactName }
            : {}),
        },
        now,
      );
      if (
        ref.attemptId &&
        (event === 'resultado' || event === 'error') &&
        data.estado
      )
        ref.result = data.estado;
    } catch {
      throw new LogError();
    } finally {
      if (handle !== undefined) fs.closeSync(handle);
    }
  }
  name(id) {
    return this.entries.get(id)?.name || null;
  }
}
module.exports = { AttemptLogs, LogError };
