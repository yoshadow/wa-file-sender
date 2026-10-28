'use strict';

const { parse } = require('csv-parse/sync');
const { normalizeName, normalizePhone } = require('../../domain/contact.cjs');

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const MAX_CONTACTS = 10000;
const MAX_RECORD_CHARS = 16384;

function emptyContacts() {
  return {
    status: 'empty',
    fileName: null,
    rows: [],
    totalRows: 0,
    validCount: 0,
    invalidCount: 0,
    fileErrors: [],
  };
}

function invalidFile(code, message, line = null) {
  return {
    ...emptyContacts(),
    status: 'invalid-file',
    fileErrors: [{ code, message, line }],
  };
}

function parseContactsCsv(bytes) {
  if (bytes.byteLength > MAX_CSV_BYTES)
    return invalidFile('FILE_TOO_LARGE', 'El CSV supera el límite de 5 MiB.');
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return invalidFile(
      'INVALID_UTF8',
      'Exporta el archivo como CSV UTF-8. No se pudo leer su codificación.',
    );
  }
  let records;
  try {
    records = parse(text, {
      bom: true,
      info: true,
      skip_empty_lines: true,
      relax_column_count: true,
      max_record_size: MAX_RECORD_CHARS,
      to: MAX_CONTACTS + 2,
    });
  } catch (error) {
    const line = Number.isSafeInteger(error.lines) ? error.lines : null;
    if (error.code === 'CSV_MAX_RECORD_SIZE')
      return invalidFile(
        'RECORD_TOO_LARGE',
        'Un registro del CSV es demasiado largo (límite: 16 KiB de caracteres).',
        line,
      );
    return invalidFile(
      'CSV_SYNTAX',
      'El CSV tiene comillas o separadores mal formados. Corrige el archivo y vuelve a importarlo.',
      line,
    );
  }
  if (!records.length)
    return invalidFile(
      'EMPTY_CSV',
      'El CSV está vacío. Incluye nombre,telefono y al menos un contacto.',
    );
  const headers = records[0].record.map((value) => value.trim().toLowerCase());
  if (
    headers.length !== 2 ||
    new Set(headers).size !== 2 ||
    !headers.includes('nombre') ||
    !headers.includes('telefono')
  ) {
    return invalidFile(
      'INVALID_HEADERS',
      'Se requieren solo las columnas nombre y telefono (sin acento), separadas por coma.',
      records[0].info.lines,
    );
  }
  if (records.length === 1)
    return invalidFile(
      'NO_CONTACTS',
      'El CSV tiene encabezados pero no contiene contactos.',
    );
  if (records.length > MAX_CONTACTS + 1)
    return invalidFile(
      'TOO_MANY_CONTACTS',
      'El CSV supera el límite de 10 000 contactos. Divide el archivo.',
    );
  const nameIndex = headers.indexOf('nombre');
  const phoneIndex = headers.indexOf('telefono');
  const names = new Map();
  const phones = new Map();
  const indexRow = (map, key, row) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  };
  const rows = records.slice(1).map(({ record, info }, index) => {
    const row = {
      record: index + 1,
      line: info.lines,
      name: (record[nameIndex] || '').normalize('NFC').trim(),
      phone: (record[phoneIndex] || '').trim(),
      normalizedPhone: null,
      errors: [],
      valid: false,
    };
    if (record.length !== 2)
      row.errors.push({
        code: 'FIELD_COUNT',
        message: 'La fila debe contener exactamente dos campos.',
      });
    try {
      const identity = normalizeName(row.name);
      row.name = identity.name;
      indexRow(names, identity.key, row);
    } catch (error) {
      row.errors.push({ code: 'INVALID_NAME', message: error.message });
    }
    if (!row.phone)
      row.errors.push({
        code: 'MISSING_PHONE',
        message: 'El teléfono está vacío.',
      });
    else {
      try {
        row.normalizedPhone = normalizePhone(row.phone);
        indexRow(phones, row.normalizedPhone, row);
      } catch {
        row.errors.push({
          code: 'INVALID_PHONE',
          message:
            'Teléfono inválido: incluye la lada internacional y todos los dígitos, sin extensiones ni notación científica. El + es opcional.',
        });
      }
    }
    return row;
  });
  for (const group of names.values()) {
    if (group.length > 1)
      for (const row of group)
        row.errors.push({
          code: 'DUPLICATE_NAME',
          message:
            'Nombre repetido: corrige todas las filas que comparten ese nombre.',
        });
  }
  for (const group of phones.values()) {
    if (group.length > 1)
      for (const row of group)
        row.errors.push({
          code: 'DUPLICATE_PHONE',
          message:
            'Teléfono repetido: corrige todas las filas que comparten ese número.',
        });
  }
  for (const row of rows) row.valid = row.errors.length === 0;
  const validCount = rows.filter((row) => row.valid).length;
  return {
    ...emptyContacts(),
    status: 'ready',
    rows,
    totalRows: rows.length,
    validCount,
    invalidCount: rows.length - validCount,
  };
}

module.exports = {
  parseContactsCsv,
  emptyContacts,
  invalidFile,
  MAX_CSV_BYTES,
  MAX_CONTACTS,
};
