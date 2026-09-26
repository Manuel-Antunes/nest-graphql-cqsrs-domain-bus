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
  MailerService,
} from '@nestjs-modules/mailer';
import type { SendMailOptions, SentMessageInfo } from 'nodemailer';

import { Mail } from './mail';
import type { CompiledMessage, Recipient } from './message';

/**
 * `@nestjs-modules/mailer`'s `MailerService`, which sends a {@link Mail} as well as the mailer's own
 * options — `@adonisjs/mail`'s `mail.send(new Mail())`.
 *
 * ```ts
 * await mailService.sendMail(new WelcomeMail(user));
 * await mailService.sendMail({ to, subject, template: 'welcome', context });
 * ```
 *
 * `MailModule` binds it as the `MailerService` too, so whatever injects the mailer — its batch
 * service, its queue processor — sends through this one instance and its transporters.
 *
 * A mail that names no `from` is given the one the `MailModule` was configured with — its
 * `defaults.from`, as it was given — before it is built, so `prepare` knows who sends it: a calendar
 * invitation names its sender as the organizer. The module's `defaults.from` stays the one place the
 * sender is configured.
 *
 * A mail is built and handed to the mailer as its own options: a body set directly as `html` or
 * `text`, an HTML view as `template`, a text view as `textTemplate`, and the views' data, merged, as
 * the one `context` the mailer has. The mailer renders them as it always does. What this adds to it is
 * one step: a `textTemplate` is resolved through the template resolver, when there is one and no
 * `text`, exactly as the mailer resolves a `template` into `html`.
 *
 * Its constructor is the mailer's. A subclass the container builds declares it again, decorators
 * included: Nest reads `@Optional()` off the class itself, never off its parent, and without it the
 * transport factory the mailer may go without becomes required.
 */
@Injectable()
export class MailService extends MailerService {
  readonly #mailerOptions: MailerOptions;

  constructor(
    @Inject(MAILER_OPTIONS) mailerOptions: MailerOptions,
    @Optional()
    @Inject(MAILER_TRANSPORT_FACTORY)
    transportFactory: MailerTransportFactory,
    @Optional()
    eventService?: MailerEventService,
  ) {
    super(mailerOptions, transportFactory, eventService);
    this.#mailerOptions = mailerOptions;
  }

  override async sendMail(
    mailOrOptions: Mail | ISendMailOptions,
  ): Promise<SentMessageInfo> {
    let sendMailOptions: ISendMailOptions;
    if (mailOrOptions instanceof Mail) {
      mailOrOptions.from ??= this.defaultFrom();
      sendMailOptions = MailService.sendMailOptionsOf(
        (await mailOrOptions.build()).toObject(),
      );
    } else {
      sendMailOptions = mailOrOptions;
    }

    const resolver = this.#mailerOptions.template?.resolver;
    if (sendMailOptions.textTemplate && resolver && !sendMailOptions.text) {
      const resolved = await resolver.resolve(
        sendMailOptions.textTemplate,
        sendMailOptions.context,
      );
      sendMailOptions = { ...sendMailOptions, text: resolved.content };
    }

    return super.sendMail(sendMailOptions);
  }

  private defaultFrom(): Recipient | undefined {
    const defaults = this.#mailerOptions.defaults as
      | Pick<SendMailOptions, 'from'>
      | undefined;
    const [from] = [defaults?.from ?? []].flat();
    return typeof from === 'object'
      ? { address: from.address, name: from.name ?? '' }
      : from;
  }

  private static sendMailOptionsOf({
    message,
    views,
  }: CompiledMessage): ISendMailOptions {
    const html = message.html ? undefined : views.html;
    const text = message.text ? undefined : views.text;
    return {
      ...message,
      ...(html ? { template: html.template } : {}),
      ...(text ? { textTemplate: text.template } : {}),
      ...(html || text ? { context: { ...html?.data, ...text?.data } } : {}),
    };
  }
}
