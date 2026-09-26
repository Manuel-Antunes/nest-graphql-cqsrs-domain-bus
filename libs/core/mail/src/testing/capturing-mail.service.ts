import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  ISendMailOptions,
  MailerOptions,
  MailerTransportFactory,
} from '@nestjs-modules/mailer';
import {
  MAILER_OPTIONS,
  MAILER_TRANSPORT_FACTORY,
  MailerEventService,
} from '@nestjs-modules/mailer';
import type { SentMessageInfo } from 'nodemailer';

import type { Mail } from '../mail';
import { MailService } from '../mail.service';

/**
 * The real {@link MailService} — mailer, template resolver, transport — keeping what the transport
 * answered. With the `json` transport that answer's `message` is the whole rendered message, which is
 * what a spec of a service that sends email wants to read:
 * `.overrideProvider(MailService).useClass(CapturingMailService)`.
 *
 * `failNext(error)` makes the next send reject before anything is sent.
 */
@Injectable()
export class CapturingMailService extends MailService {
  readonly sent: SentMessageInfo[] = [];
  #failures: Error[] = [];

  constructor(
    @Inject(MAILER_OPTIONS) mailerOptions: MailerOptions,
    @Optional()
    @Inject(MAILER_TRANSPORT_FACTORY)
    transportFactory: MailerTransportFactory,
    @Optional()
    eventService?: MailerEventService,
  ) {
    super(mailerOptions, transportFactory, eventService);
  }

  failNext(error: Error = new Error('the transport is down')): this {
    this.#failures.push(error);
    return this;
  }

  override async sendMail(
    mailOrOptions: Mail | ISendMailOptions,
  ): Promise<SentMessageInfo> {
    const failure = this.#failures.shift();
    if (failure) throw failure;
    const sent = await super.sendMail(mailOrOptions);
    this.sent.push(sent);
    return sent;
  }
}
