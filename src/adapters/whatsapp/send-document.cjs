'use strict';
const { normalizePhone } = require('../../domain/contact.cjs');
const {
  SendFailure,
  classifySendFailure,
} = require('../../domain/send-failure.cjs');
const { serializedId } = require('./serialized-id.cjs');
const { loadDocument } = require('./document-media.cjs');
const { validateMessage } = require('../../domain/message.cjs');

async function sendDocument(
  { zip, phone, account, message: caption = '' },
  { root, client, assertReady, MessageMedia, mock = false },
) {
  let phase = 'zip',
    mayHaveSent = false;
  try {
    try {
      validateMessage(caption);
    } catch {
      throw new SendFailure({ code: 'MESSAGE_INVALID', mayHaveSent: false });
    }
    assertReady(account);
    phone = normalizePhone(phone);
    const bytes = await loadDocument(root, zip);
    assertReady(account);
    phase = 'recipient';
    const recipient = mock
      ? { _serialized: `${phone.slice(1)}@c.us` }
      : await client.getNumberId(phone.slice(1));
    const recipientId = serializedId(recipient);
    if (!recipientId || !/^[0-9]+@(c\.us|lid)$/u.test(recipientId))
      throw new SendFailure({ code: 'RECIPIENT_UNAVAILABLE' });
    assertReady(account);
    if (mock)
      return { messageId: 'SIMULATED-DOCUMENT-NOT-SENT', size: bytes.length };
    const media = new MessageMedia(
      'application/zip',
      bytes.toString('base64'),
      zip.name,
      bytes.length,
    );
    assertReady(account);
    phase = 'send';
    mayHaveSent = true;
    const message = await client.sendMessage(recipientId, media, {
      sendMediaAsDocument: true,
      sendSeen: false,
      waitUntilMsgSent: true,
      ...(caption ? { caption } : {}),
    });
    phase = 'receipt';
    const messageId = serializedId(message?.id);
    if (!messageId) throw new SendFailure({ code: 'NO_MESSAGE_ID' });
    return { messageId, size: bytes.length };
  } catch (error) {
    throw classifySendFailure(error, { phase, mayHaveSent });
  }
}
module.exports = { sendDocument };
