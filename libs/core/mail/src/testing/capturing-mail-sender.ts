import { MailerService } from '@nestjs-modules/mailer';

import type { Mail } from '../mail';
import type { SentMail } from '../mail-sender';
import { NestMailerSender } from '../nest-mailer.sender';

/**
 * The real sender — mailer, template resolver, transport — keeping what the transport answered. With
 * the `json` transport that answer is the whole rendered message, which is what a spec of a service
 * that sends email wants to read.
 *
 * `failNext(error)` makes the next `send` reject before anything is sent.
 */
export class CapturingMailSender extends NestMailerSender {
  readonly sent: SentMail[] = [];
  #failures: Error[] = [];

  failNext(error: Error = new Error('the transport is down')): this {
    this.#failures.push(error);
    return this;
  }

  override async send(mail: Mail): Promise<SentMail> {
    const failure = this.#failures.shift();
    if (failure) throw failure;
    const sent = await super.send(mail);
    this.sent.push(sent);
    return sent;
  }
}

/** Binds {@link CapturingMailSender} in place of the module's sender: `.overrideProvider(MailSender).useFactory(capturingMailSender)`. */
export const capturingMailSender = {
  factory: (mailer: MailerService) => new CapturingMailSender(mailer),
  inject: [MailerService],
};
