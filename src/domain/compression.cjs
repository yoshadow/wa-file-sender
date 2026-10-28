'use strict';

const MESSAGES = Object.freeze({
  CHANGED:
    'Los archivos cambiaron o ya no coinciden con la revisión. Vuelve a seleccionar la carpeta y revisarlos.',
  PATH: 'La ruta dejó de ser segura o contiene enlaces. Vuelve a revisar la carpeta.',
  NAME: 'Hay nombres de archivo incompatibles o ambiguos para un ZIP multiplataforma. Quita esos archivos de la selección.',
  EMPTY: 'Selecciona al menos un archivo válido del destinatario.',
  LIMIT:
    'El ZIP supera el límite de 20 MiB. Reduce la selección y vuelve a revisar.',
  SPACE:
    'No hay espacio suficiente para el ZIP temporal. Libera espacio y vuelve a revisar.',
  CLEANUP:
    'No se pudo eliminar el ZIP temporal. Cierra los archivos abiertos y pulsa Eliminar temporal antes de continuar.',
  CANCELLED: 'Operación cancelada. No se creó un ZIP utilizable.',
  IO: 'No se pudo leer o comprimir la selección. Revisa los permisos y vuelve a revisar los archivos.',
});
class CompressionError extends Error {
  constructor(code = 'IO') {
    super(MESSAGES[code] || MESSAGES.IO);
    this.code = Object.hasOwn(MESSAGES, code) ? code : 'IO';
  }
}
function safeCode(error) {
  if (error instanceof CompressionError) return error.code;
  if (error?.code === 'ENOSPC' || error?.code === 'EDQUOT') return 'SPACE';
  if (error?.name === 'AbortError') return 'CANCELLED';
  return 'IO';
}
module.exports = { CompressionError, safeCode };
