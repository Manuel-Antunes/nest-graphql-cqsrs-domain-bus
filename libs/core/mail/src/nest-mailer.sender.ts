import { Injectable } from '@nestjs/common';
import type { ISendMailOptions } from '@nestjs-modules/mailer';
import { MailerService } from '@nestjs-modules/mailer';

import type { Mail } from './mail';
import type { SentMail } from './mail-sender';
import { MailSender } from './mail-sender';
import type { CompiledMessage } from './message';

/**
 * {@link MailSender} over `@nestjs-modules/mailer`.
 *
 * It builds the mail and hands the message to `sendMail` as it is. A message with a view goes out with
 * `template` and `context`, and rendering it is the mailer's business — its resolver or its adapter,
 * whichever the module was configured with.
 */
@Injectable()
export class NestMailerSender extends MailSender {
  constructor(private readonly mailer: MailerService) {
    super();
  }

  async send(mail: Mail): Promise<SentMail> {
    const compiled = (await mail.build()).toObject();
    const info = await this.mailer.sendMail(this.sendMailOptionsOf(compiled));
    return {
      messageId: info.messageId,
      envelope: info.envelope,
      response: info.response ?? info.message,
    };
  }

  private sendMailOptionsOf({
    message,
    view,
  }: CompiledMessage): ISendMailOptions {
    return !view || message.html
      ? message
      : { ...message, template: view.template, context: view.context };
  }
}
