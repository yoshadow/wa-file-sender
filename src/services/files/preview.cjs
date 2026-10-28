'use strict';

const { randomUUID } = require('node:crypto');
const { normalizeName, UserError } = require('../../domain/contact.cjs');

function nameKey(name) {
  try {
    return normalizeName(name).key;
  } catch {
    return null;
  }
}

function validateSelectionArguments(args) {
  const request = args[0];
  if (
    args.length !== 1 ||
    !request ||
    typeof request !== 'object' ||
    Array.isArray(request) ||
    Object.keys(request).sort().join(',') !== 'id,revision,selected' ||
    typeof request.id !== 'string' ||
    request.id.length > 80 ||
    typeof request.revision !== 'string' ||
    request.revision.length > 80 ||
    typeof request.selected !== 'boolean'
  )
    throw new UserError('La selección no es válida.');
}

class PreviewService {
  constructor({ selectDirectory, scan }) {
    this.selectDirectory = selectDirectory;
    this.scan = scan;
    this.contacts = [];
    this.clearedAttempts = new Map();
    this.busy = false;
    this.clear();
  }
  assertIdle() {
    if (this.busy)
      throw new UserError('Espera a que termine la revisión de carpetas.');
  }
  clear() {
    this.assertIdle();
    this.revision = randomUUID();
    this.status = 'empty';
    this.root = null;
    this.rootName = null;
    this.rows = [];
    this.excluded = [];
    this.error = null;
    return this.snapshot();
  }
  setContacts(state) {
    this.assertIdle();
    this.contacts = state.status === 'ready' ? state.rows : [];
    this.clear();
  }
  clearSentSelections(attempts, account) {
    let changed = false;
    for (const attempt of attempts) {
      const key = `${account}:${attempt.phone}`;
      if (this.clearedAttempts.get(key) === attempt.id) continue;
      for (const row of this.rows.filter((row) => row.phone === attempt.phone))
        for (const file of row.files) {
          if (file.selected) changed = true;
          file.selected = false;
        }
      this.clearedAttempts.set(key, attempt.id);
    }
    if (changed) this.revision = randomUUID();
  }
  snapshot() {
    const rows = this.rows.map((row) => ({
      id: row.id,
      folderName: row.folderName,
      contactName: row.contactName,
      phone: row.phone,
      eligible: row.eligible,
      issues: [...row.issues],
      selected: row.files.some((file) => file.selected),
      files: row.files.map((file) => ({
        id: file.id,
        name: file.name,
        size: file.size,
        readable: file.readable,
        reason: file.reason,
        selected: file.selected,
      })),
    }));
    const selectedRows = rows.filter((row) => row.selected);
    return {
      revision: this.revision,
      status: this.status,
      busy: this.busy,
      rootName: this.rootName,
      error: this.error,
      rows,
      excluded: this.excluded.map((entry) => ({ ...entry })),
      eligibleCount: rows.filter((row) => row.eligible).length,
      selectedCount: selectedRows.length,
      selectedFileCount: selectedRows.reduce(
        (sum, row) => sum + row.files.filter((file) => file.selected).length,
        0,
      ),
      selectedBytes: selectedRows.reduce(
        (sum, row) =>
          sum +
          row.files.reduce(
            (bytes, file) => bytes + (file.selected ? file.size : 0),
            0,
          ),
        0,
      ),
    };
  }
  async selectRoot() {
    this.assertIdle();
    if (!this.contacts.some((contact) => contact.valid))
      throw new UserError(
        'Importa primero un CSV con al menos un contacto válido.',
      );
    this.busy = true;
    try {
      const selected = await this.selectDirectory();
      if (!selected)
        return { ...this.snapshot(), busy: false, cancelled: true };
      this.revision = randomUUID();
      this.status = 'loading';
      this.root = null;
      this.rootName = null;
      this.rows = [];
      this.excluded = [];
      this.error = null;
      try {
        const scanned = await this.scan(selected);
        this.root = scanned.root;
        this.rootName = scanned.name;
        this.excluded = scanned.excluded;
        this.rows = this.associate(scanned.folders);
        this.status = 'ready';
      } catch (error) {
        this.status = 'error';
        this.error =
          error instanceof UserError
            ? error.message
            : 'No se pudo revisar la carpeta. Revisa los permisos y vuelve a seleccionarla.';
      }
    } finally {
      this.busy = false;
    }
    return this.snapshot();
  }
  associate(folders) {
    const contactsByName = new Map();
    const foldersByName = new Map();
    const add = (map, key, value) => {
      if (key) map.set(key, [...(map.get(key) || []), value]);
    };
    for (const contact of this.contacts)
      add(contactsByName, nameKey(contact.name), contact);
    for (const folder of folders)
      add(foldersByName, nameKey(folder.name), folder);
    const rows = folders.map((folder) => {
      const key = nameKey(folder.name);
      const matches = contactsByName.get(key) || [];
      const contact = matches.length === 1 ? matches[0] : null;
      const issues = [...folder.issues];
      if (!key) issues.push('Nombre de carpeta inválido.');
      if ((foldersByName.get(key) || []).length > 1)
        issues.push('Varias carpetas tienen el mismo nombre normalizado.');
      if (!matches.length) issues.push('Carpeta sin contacto en el CSV.');
      else if (matches.length > 1) issues.push('Nombre ambiguo en el CSV.');
      else if (!contact.valid)
        issues.push('El contacto tiene errores en el CSV.');
      if (!folder.files.length && !folder.issues.length)
        issues.push('Carpeta vacía.');
      else if (!folder.files.some((file) => file.readable))
        issues.push('No hay archivos directos legibles para seleccionar.');
      const eligible = Boolean(
        key &&
        matches.length === 1 &&
        contact.valid &&
        foldersByName.get(key).length === 1 &&
        !folder.issues.length &&
        folder.files.some((file) => file.readable),
      );
      return {
        id: randomUUID(),
        folderName: folder.name,
        contactName: contact?.name || null,
        phone: contact?.normalizedPhone || null,
        eligible,
        issues,
        files: folder.files.map((file) => ({
          ...file,
          id: randomUUID(),
          selected: false,
        })),
      };
    });
    for (const contact of this.contacts) {
      if (!foldersByName.has(nameKey(contact.name)))
        rows.push({
          id: randomUUID(),
          folderName: null,
          contactName: contact.name,
          phone: contact.normalizedPhone,
          eligible: false,
          issues: [
            contact.valid
              ? 'Contacto sin carpeta asociada.'
              : 'Contacto inválido y sin carpeta asociada.',
          ],
          files: [],
        });
    }
    return rows;
  }
  select(request) {
    this.assertIdle();
    if (request.revision !== this.revision || this.status !== 'ready')
      throw new UserError(
        'La vista previa cambió. Revisa la selección actual.',
      );
    const row = this.rows.find(
      (candidate) =>
        candidate.id === request.id ||
        candidate.files.some((file) => file.id === request.id),
    );
    if (!row?.eligible)
      throw new UserError('Este elemento no es válido para seleccionar.');
    if (row.id === request.id) {
      for (const file of row.files)
        file.selected = file.readable && request.selected;
    } else {
      const file = row.files.find((candidate) => candidate.id === request.id);
      if (!file.readable) throw new UserError('El archivo está excluido.');
      file.selected = request.selected;
    }
    this.revision = randomUUID();
    return this.snapshot();
  }
  compressionPlan(request) {
    this.assertIdle();
    if (this.status !== 'ready' || request.revision !== this.revision)
      throw new UserError('La selección cambió. Revisa los archivos actuales.');
    const row = this.rows.find((item) => item.id === request.id);
    const files =
      row?.files.filter((file) => file.selected && file.readable) || [];
    if (!row?.eligible || !files.length)
      throw new UserError(
        'Marca al menos un archivo de un destinatario válido.',
      );
    return {
      root: this.root,
      folderName: row.folderName,
      rowId: row.id,
      contactName: row.contactName,
      phone: row.phone,
      revision: this.revision,
      files: files.map((file) => ({
        name: file.name,
        path: file.path,
        identity: { ...file.identity },
      })),
    };
  }
  batchPlans(revision) {
    this.assertIdle();
    if (revision !== this.revision || this.status !== 'ready')
      throw new UserError('La selección cambió. Revisa de nuevo el lote.');
    const selected = this.rows.filter(
      (row) => row.eligible && row.files.some((file) => file.selected),
    );
    if (!selected.length)
      throw new UserError('Marca archivos de al menos un destinatario.');
    return {
      revision: this.revision,
      plans: selected.map((row) =>
        this.compressionPlan({ id: row.id, revision }),
      ),
    };
  }
}

module.exports = { PreviewService, validateSelectionArguments };
