'use strict';
const fs = require('node:fs/promises');
const { UserError } = require('../domain/contact.cjs');

function validateLanguage(args) {
  if (args.length !== 1 || !['es', 'en'].includes(args[0]))
    throw new UserError('Idioma no válido.');
}

class LanguagePreference {
  constructor(file, io = fs) {
    this.file = file;
    this.io = io;
    this.language = 'es';
    this.busy = false;
  }
  async load() {
    try {
      const value = JSON.parse(await this.io.readFile(this.file, 'utf8'));
      if (['es', 'en'].includes(value.language)) this.language = value.language;
    } catch {
      // Missing or corrupt settings must not prevent opening the application.
    }
    return this.language;
  }
  async save(language) {
    validateLanguage([language]);
    if (this.busy)
      throw new UserError('Espera a que termine el cambio de idioma.');
    if (language === this.language) return this.language;
    this.busy = true;
    try {
      await this.io.writeFile(
        `${this.file}.tmp`,
        JSON.stringify({ language }) + '\n',
        { mode: 0o600 },
      );
      await this.io.rename(`${this.file}.tmp`, this.file);
      this.language = language;
      return language;
    } catch {
      await this.io.rm(`${this.file}.tmp`, { force: true }).catch(() => {});
      throw new UserError(
        'No se pudo guardar el idioma. Revisa los permisos e inténtalo de nuevo.',
      );
    } finally {
      this.busy = false;
    }
  }
}
module.exports = { LanguagePreference, validateLanguage };
