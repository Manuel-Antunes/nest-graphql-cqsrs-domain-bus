import type { Recipient } from './message';
import { Message } from './message';

/**
 * A class-based email `BaseMail`: one class per kind of email,
 * holding what it needs and composing its own {@link Message} in {@link prepare}.
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
 *     this.message.to(this.to).view(PostCreatedEmail, this.post);
 *   }
 * }
 * ```
 *
 * A mail does not send itself. It is handed to a {@link MailSender}, which builds it and passes the
 * result to the transport — which is what lets the same class be delivered by SMTP locally, by SES
 * on AWS and by a recording sender in a spec.
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

  /** Composes the message: recipients, body, attachments. */
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
