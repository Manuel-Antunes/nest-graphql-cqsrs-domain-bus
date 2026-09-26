import type { ISendMailOptions } from '@nestjs-modules/mailer';
import type { SentMessageInfo } from 'nodemailer';

import { Mail } from '../mail';
import type { MailService } from '../mail.service';
import type { MessageBodyTemplates } from '../message';

/** One send a {@link RecordingMailService} was handed: a mail as it was built, views unrendered, or the mailer's options. */
export interface RecordedMail {
  mail?: Mail;
  message: ISendMailOptions;
  views: MessageBodyTemplates;
}

/**
 * A stand-in for {@link MailService} that keeps what it is handed instead of sending it:
 * `{ provide: MailService, useValue: new RecordingMailService() }`.
 *
 * `failNext(error)` makes the next send reject, which is how a spec proves what a caller does when
 * the transport is down.
 */
export class RecordingMailService implements Pick<MailService, 'sendMail'> {
  readonly sent: RecordedMail[] = [];
  #failures: Error[] = [];

  failNext(error: Error = new Error('the transport is down')): this {
    this.#failures.push(error);
    return this;
  }

  async sendMail(
    mailOrOptions: Mail | ISendMailOptions,
  ): Promise<SentMessageInfo> {
    const failure = this.#failures.shift();
    if (failure) throw failure;
    this.sent.push(
      mailOrOptions instanceof Mail
        ? { mail: mailOrOptions, ...(await mailOrOptions.build()).toObject() }
        : { message: mailOrOptions, views: {} },
    );
    return {
      messageId: `recorded-${this.sent.length}`,
      envelope: { from: false, to: [] },
    };
  }
}
