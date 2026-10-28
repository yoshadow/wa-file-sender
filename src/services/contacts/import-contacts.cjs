'use strict';

const { open } = require('node:fs/promises');
const path = require('node:path');
const { UserError } = require('../../domain/contact.cjs');
const {
  MAX_CSV_BYTES,
  emptyContacts,
  invalidFile,
} = require('./parse-csv.cjs');

async function readBoundedCsv(file) {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile())
      throw new UserError('Selecciona un archivo CSV regular.');
    if (info.size > MAX_CSV_BYTES)
      throw new UserError('El CSV supera el límite de 5 MiB.');
    const bytes = Buffer.alloc(MAX_CSV_BYTES + 1);
    let total = 0;
    while (total < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        total,
        bytes.length - total,
        total,
      );
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > MAX_CSV_BYTES)
      throw new UserError('El CSV supera el límite de 5 MiB.');
    return Buffer.from(bytes.subarray(0, total));
  } finally {
    await handle.close();
  }
}

class ContactsService {
  constructor({ selectFile, parseBytes }) {
    this.selectFile = selectFile;
    this.parseBytes = parseBytes;
    this.current = emptyContacts();
    this.busy = false;
  }
  snapshot() {
    return { ...this.current, busy: this.busy };
  }
  async selectCsv() {
    if (this.busy)
      throw new UserError('Hay una importación de contactos en curso.');
    this.busy = true;
    let cancelled = false;
    try {
      const selected = await this.selectFile();
      if (!selected) cancelled = true;
      else {
        this.current = {
          ...emptyContacts(),
          status: 'loading',
          fileName: path.basename(selected),
        };
        try {
          if (path.extname(selected).toLowerCase() !== '.csv')
            throw new UserError('Selecciona un archivo con extensión .csv.');
          const bytes = await readBoundedCsv(selected);
          const result = await this.parseBytes(bytes);
          this.current = { ...result, fileName: path.basename(selected) };
        } catch (error) {
          this.current = {
            ...invalidFile(
              'IMPORT_FAILED',
              error instanceof UserError
                ? error.message
                : 'No se pudo leer o validar el CSV. Revisa los permisos y vuelve a seleccionarlo.',
            ),
            fileName: path.basename(selected),
          };
        }
      }
    } finally {
      this.busy = false;
    }
    return { ...this.snapshot(), cancelled };
  }
  clear() {
    if (this.busy)
      throw new UserError(
        'Espera a que termine la importación para quitar los contactos.',
      );
    this.current = emptyContacts();
    return this.snapshot();
  }
}

module.exports = { ContactsService, readBoundedCsv };
