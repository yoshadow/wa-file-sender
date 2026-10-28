'use strict';

// Allowlisted diagnostics only: never transfer raw browser errors, paths or account data.
const MESSAGES = Object.freeze({
  MEDIA_ID_CONFLICT:
    'WhatsApp Web rechazó el identificador interno del archivo adjunto.',
  MEDIA_PREPARATION:
    'WhatsApp Web no pudo preparar o cargar el archivo adjunto.',
  ZIP_PREPARATION: 'No se pudo crear el ZIP temporal de prueba.',
  ZIP_CHANGED: 'El ZIP temporal cambió o ya no coincide con el aprobado.',
  ZIP_PATH:
    'El ZIP temporal no está en una ruta propia y segura de la aplicación.',
  ZIP_READ: 'No se pudo leer el ZIP temporal aprobado.',
  MESSAGE_INVALID: 'El mensaje no es válido. Vuelve a revisar el envío.',
  RECIPIENT_UNAVAILABLE: 'No se pudo resolver el destinatario en WhatsApp.',
  SESSION_CHANGED: 'La conexión o la cuenta de WhatsApp cambió.',
  CONNECTION_LOST: 'Se perdió la conexión con el navegador de WhatsApp.',
  NO_MESSAGE_ID: 'WhatsApp Web no devolvió un identificador del mensaje.',
  TIMEOUT: 'WhatsApp no respondió dentro del tiempo permitido.',
  UNKNOWN: 'La integración con WhatsApp Web no pudo completar la prueba.',
});
const PHASES = new Set(['zip', 'recipient', 'send', 'receipt']);

class SendFailure extends Error {
  constructor({ code, phase, mayHaveSent = true, cleanupFailed = false } = {}) {
    code = Object.hasOwn(MESSAGES, code) ? code : 'UNKNOWN';
    super(MESSAGES[code]);
    this.code = code;
    this.phase = PHASES.has(phase) ? phase : 'send';
    this.mayHaveSent = mayHaveSent !== false;
    this.cleanupFailed = cleanupFailed === true;
  }
  toDiagnostic() {
    return {
      code: this.code,
      phase: this.phase,
      mayHaveSent: this.mayHaveSent,
      cleanupFailed: this.cleanupFailed,
    };
  }
}

function classifySendFailure(error, context) {
  const text = String(error?.message || '');
  let code = error instanceof SendFailure ? error.code : 'UNKNOWN';
  if (code === 'UNKNOWN') {
    if (
      /Data passed to getter must include an id property|\bgetValidatedSender\b/.test(
        text,
      )
    )
      code = 'MEDIA_ID_CONFLICT';
    else if (
      /Target closed|Session closed|Connection closed|detached Frame|Execution context was destroyed/i.test(
        text,
      )
    )
      code = 'CONNECTION_LOST';
    else if (/Session unavailable/.test(text)) code = 'SESSION_CHANGED';
    else if (/media-fault|upload failed|prepRawMedia|InvalidMedia/i.test(text))
      code = 'MEDIA_PREPARATION';
    else if (context.phase === 'zip') code = 'ZIP_PREPARATION';
    else if (context.phase === 'recipient') code = 'RECIPIENT_UNAVAILABLE';
  }
  return new SendFailure({ ...context, code });
}

module.exports = { SendFailure, classifySendFailure, MESSAGES };
