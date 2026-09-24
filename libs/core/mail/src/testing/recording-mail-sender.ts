import type { Mail } from '../mail';
import type { SentMail } from '../mail-sender';
import { MailSender } from '../mail-sender';
import type { CompiledMessage } from '../message';

/** One mail a {@link RecordingMailSender} was handed, as it was built. */
export interface RecordedMail extends CompiledMessage {
  mail: Mail;
}

/**
 * A {@link MailSender} that keeps what it is handed instead of sending it.
 *
 * `failNext(error)` makes the next `send` reject, which is how a spec proves what a caller does when
 * the transport is down.
 */
export class RecordingMailSender extends MailSender {
  readonly sent: RecordedMail[] = [];
  #failures: Error[] = [];

  failNext(error: Error = new Error('the transport is down')): this {
    this.#failures.push(error);
    return this;
  }

  async send(mail: Mail): Promise<SentMail> {
    const failure = this.#failures.shift();
    if (failure) throw failure;
    const compiled = (await mail.build()).toObject();
    this.sent.push({ ...compiled, mail });
    return {
      messageId: `recorded-${this.sent.length}`,
      envelope: { from: false, to: [] },
      response: compiled,
    };
  }
}
