import type { TemplateResolver } from '@nestjs-modules/mailer';

import type { Recipient } from './message';
import { Message } from './message';

/**
 * A class-based email, `@adonisjs/mail`'s `BaseMail`: one class per kind of email, holding what it
 * needs and composing its own {@link Message} in {@link prepare}.
 *
 * ```ts
 * export class PostCreatedNotificationMail extends Mail {
 *   override subject = 'Your post is live';
 *
 *   constructor(private readonly post: { title: string; url: string }, private readonly to: string) {
 *     super();
 *   }
 *
 *   prepare() {
 *     this.message
 *       .to(this.to)
 *       .htmlView(PostCreatedEmail, this.post)
 *       .textView(PostCreatedEmail.text, this.post);
 *   }
 * }
 * ```
 *
 * A mail does not send itself: `MailService.sendMail(mail)` builds it and hands the result to the
 * mailer, which is what lets the same class be delivered by SMTP locally, by SES on AWS and by a
 * recording stand-in in a spec.
 *
 * Its views are rendered when it is sent, by the mailer, unless `prepare` renders them itself with
 * `await this.message.computeContents(resolver)` — then the mail leaves with its bodies, and the
 * mailer renders nothing.
 */
export abstract class Mail {
  /** The subject, applied before {@link prepare} runs, which may still override it. */
  subject?: string;

  /** The sender, when it is not the module's default. */
  from?: Recipient;

  /** The address replies go to. */
  replyTo?: Recipient;

  readonly message = new Message();

  #built = false;

  /** Composes the message: recipients, bodies, attachments. */
  abstract prepare(): void | Promise<void>;

  /** Prepares the message once, however many times it is asked for. */
  async build(): Promise<Message> {
    if (this.#built) return this.message;
    this.#built = true;
    this.#defineSubject();
    this.#defineSender();
    await this.prepare();
    return this.message;
  }

  /**
   * Builds the message and renders its views, as {@link Message.computeContents} does: how a spec reads
   * the HTML and the text of a mail without sending it.
   */
  async buildWithContents(resolver: TemplateResolver): Promise<Message> {
    return (await this.build()).computeContents(resolver);
  }

  #defineSubject() {
    if (this.subject) this.message.subject(this.subject);
  }

  #defineSender() {
    if (this.from) {
      typeof this.from === 'string'
        ? this.message.from(this.from)
        : this.message.from(this.from.address, this.from.name);
    }
    if (this.replyTo) {
      typeof this.replyTo === 'string'
        ? this.message.replyTo(this.replyTo)
        : this.message.replyTo(this.replyTo.address, this.replyTo.name);
    }
  }
}
