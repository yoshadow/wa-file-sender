'use strict';
const { SendFailure } = require('../../domain/send-failure.cjs');

class WhatsAppTransport {
  constructor(adapter, latestBatchEnd = () => 0) {
    this.adapter = adapter;
    this.latestBatchEnd = latestBatchEnd;
  }
  whatsappState() {
    return {
      ready: this.adapter.state.status === 'ready',
      account: this.adapter.state.account,
    };
  }
  state() {
    return { ...this.whatsappState(), mode: 'whatsapp' };
  }
  lastEnd() {
    return this.latestBatchEnd();
  }
  async check(item) {
    if (
      !this.whatsappState().ready ||
      !(await this.adapter.checkNumber(item.phone))
    )
      throw new SendFailure({
        code: 'RECIPIENT_UNAVAILABLE',
        phase: 'recipient',
        mayHaveSent: false,
      });
  }
  async send(zip, item, _outcome, message = '') {
    const account = this.adapter.state.account;
    if (!this.whatsappState().ready || !account)
      throw new SendFailure({ code: 'SESSION_CHANGED', mayHaveSent: false });
    try {
      const result = await this.adapter.sendDocument(
        zip,
        item.phone,
        account,
        message,
      );
      if (!result?.messageId) throw new SendFailure({ code: 'NO_MESSAGE_ID' });
      return { id: result.messageId };
    } catch (error) {
      if (!(error instanceof SendFailure && error.mayHaveSent === false)) {
        await this.adapter.stop().catch(() => {});
        this.adapter.setState?.({
          status: 'error',
          account: null,
          qr: null,
          problem: 'send',
        });
      }
      throw error;
    }
  }
  interrupt() {
    return this.adapter.stop().catch(() => {});
  }
}
module.exports = { WhatsAppTransport };
