import { basename } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { SendMailOptions } from 'nodemailer';

import type { EmailTemplate } from './email-template';

/** An address, bare or with a display name. */
export type Recipient = { address: string; name: string } | string;

/** One attachment, exactly as nodemailer takes it. */
export type AttachmentOptions = Exclude<
  SendMailOptions['attachments'],
  undefined
>[number];

/** The part of a message nodemailer's `sendMail` understands, and nothing else. */
export interface NodeMailerMessage {
  from?: Recipient;
  to?: Recipient[];
  cc?: Recipient[];
  bcc?: Recipient[];
  replyTo?: Recipient[];
  messageId?: string;
  subject?: string;
  inReplyTo?: string;
  references?: string[];
  priority?: 'low' | 'normal' | 'high';
  attachments?: AttachmentOptions[];
  headers?: Record<string, string | string[]>;
  html?: string;
  text?: string;
}

/**
 * A template to render the body with, by NAME, and what it is rendered with: the mailer's `template`
 * and `context`. The message is plain data until it is sent, so a message built in one process can be
 * rendered in another that knows the same template.
 */
export interface MessageView {
  template: string;
  context: Record<string, unknown>;
}

/** What a built message is: the nodemailer fields, and the view its body is rendered from. */
export interface CompiledMessage {
  message: NodeMailerMessage;
  view?: MessageView;
}

type RecipientField = 'to' | 'cc' | 'bcc' | 'replyTo';

const addressOf = (recipient: Recipient): string =>
  typeof recipient === 'string' ? recipient : recipient.address;

const nameOf = (recipient: Recipient): string | undefined =>
  typeof recipient === 'string' ? undefined : recipient.name;

const recipientFrom = (address: string, name?: string): Recipient =>
  name ? { address, name } : address;

/**
 * A fluent builder over one email
 *
 * Every setter returns the message, so a {@link Mail} writes its body as one chain:
 *
 * ```ts
 * this.message
 *   .to(recipient.email, recipient.name)
 *   .subject('Your post is live')
 *   .view(PostCreatedEmail, { title, url });
 * ```
 *
 * The body is either `html`/`text`, set directly, or a {@link view}: a template and its context,
 * rendered by the mailer when the message is sent. A message with both keeps the explicit HTML.
 */
export class Message {
  readonly #message: NodeMailerMessage = {};
  #view?: MessageView;

  /** Adds a `to` recipient. */
  to(address: string, name?: string): this {
    return this.#addRecipient('to', address, name);
  }

  /** Adds one `cc` recipient, or several. */
  cc(address: string | Recipient[], name?: string): this {
    return this.#addRecipients('cc', address, name);
  }

  /** Adds one `bcc` recipient, or several. */
  bcc(address: string | Recipient[], name?: string): this {
    return this.#addRecipients('bcc', address, name);
  }

  /** Sets the sender, replacing the module's default `from`. */
  from(address: string, name?: string): this {
    this.#message.from = recipientFrom(address, name);
    return this;
  }

  /** Adds a `reply-to` address. */
  replyTo(address: string, name?: string): this {
    return this.#addRecipient('replyTo', address, name);
  }

  subject(subject: string): this {
    this.#message.subject = subject;
    return this;
  }

  messageId(messageId: string): this {
    this.#message.messageId = messageId;
    return this;
  }

  inReplyTo(messageId: string): this {
    this.#message.inReplyTo = messageId;
    return this;
  }

  references(messageIds: string[]): this {
    this.#message.references = [...messageIds];
    return this;
  }

  priority(priority: 'low' | 'normal' | 'high'): this {
    this.#message.priority = priority;
    return this;
  }

  /** Sets the HTML body directly, which takes precedence over a {@link view}. */
  html(content: string): this {
    this.#message.html = content;
    return this;
  }

  /** Sets the plain-text body. Without one, it is rendered from the {@link view}. */
  text(content: string): this {
    this.#message.text = content;
    return this;
  }

  /**
   * Renders the body from a template, when the message is sent: the mailer is handed `template` and
   * `context`, and whatever renders templates in it — `ReactEmailTemplateResolver`, a Handlebars
   * adapter — does the rest.
   *
   * A React Email template is passed as the `EmailTemplate` `defineEmailTemplate` returned, which types
   * its props; any other engine's by the name it knows the template by. Either way the context must be
   * plain data: the message is serialised before it is rendered.
   */
  view<P extends object>(template: EmailTemplate<P>, props: P): this;
  view(template: string, context?: Record<string, unknown>): this;
  view(template: { name: string } | string, context: object = {}): this {
    this.#view = {
      template: typeof template === 'string' ? template : template.name,
      context: { ...context } as Record<string, unknown>,
    };
    return this;
  }

  /** Attaches a file from disk. */
  attach(
    file: string | URL,
    options?: Omit<AttachmentOptions, 'path' | 'content' | 'raw' | 'cid'>,
  ): this {
    const path = typeof file === 'string' ? file : fileURLToPath(file);
    return this.#attach({ path, filename: basename(path), ...options });
  }

  /** Attaches content held in memory. */
  attachData(
    content: Readable | Buffer | string,
    options: Omit<AttachmentOptions, 'path' | 'content' | 'raw' | 'cid'> & {
      filename: string;
    },
  ): this {
    return this.#attach({ content, ...options });
  }

  /** Attaches a file from disk under a `cid`, for `<img src="cid:…">` inside the body. */
  embed(
    file: string | URL,
    cid: string,
    options?: Omit<AttachmentOptions, 'path' | 'content' | 'raw' | 'cid'>,
  ): this {
    const path = typeof file === 'string' ? file : fileURLToPath(file);
    return this.#attach({ path, cid, filename: basename(path), ...options });
  }

  /** Attaches in-memory content under a `cid`. */
  embedData(
    content: Readable | Buffer | string,
    cid: string,
    options?: Omit<AttachmentOptions, 'path' | 'content' | 'raw' | 'cid'>,
  ): this {
    return this.#attach({ content, cid, ...options });
  }

  /** Adds a header, or replaces one already set. */
  header(key: string, value: string | string[]): this {
    this.#message.headers = { ...this.#message.headers, [key]: value };
    return this;
  }

  hasTo(address: string, name?: string): boolean {
    return this.#hasRecipient('to', address, name);
  }

  hasCc(address: string, name?: string): boolean {
    return this.#hasRecipient('cc', address, name);
  }

  hasBcc(address: string, name?: string): boolean {
    return this.#hasRecipient('bcc', address, name);
  }

  hasReplyTo(address: string, name?: string): boolean {
    return this.#hasRecipient('replyTo', address, name);
  }

  hasFrom(address: string, name?: string): boolean {
    const from = this.#message.from;
    return (
      from !== undefined &&
      addressOf(from) === address &&
      (name === undefined || nameOf(from) === name)
    );
  }

  hasSubject(subject: string): boolean {
    return this.#message.subject === subject;
  }

  hasView<P extends object>(template: EmailTemplate<P> | string): boolean {
    return (
      this.#view?.template ===
      (typeof template === 'string' ? template : template.name)
    );
  }

  hasHeader(key: string, value?: string | string[]): boolean {
    const current = this.#message.headers?.[key];
    if (current === undefined) return false;
    return value === undefined || String(current) === String(value);
  }

  hasAttachment(filename: string): boolean {
    return (this.#message.attachments ?? []).some(
      (attachment) => attachment.filename === filename,
    );
  }

  /** The message as plain data: what a sender hands to nodemailer, and what a queue could carry. */
  toObject(): CompiledMessage {
    return {
      message: copyOf(this.#message),
      ...(this.#view ? { view: { ...this.#view } } : {}),
    };
  }

  toJSON(): CompiledMessage {
    return this.toObject();
  }

  #addRecipient(field: RecipientField, address: string, name?: string): this {
    this.#message[field] = [
      ...(this.#message[field] ?? []),
      recipientFrom(address, name),
    ];
    return this;
  }

  #addRecipients(
    field: RecipientField,
    address: string | Recipient[],
    name?: string,
  ): this {
    if (typeof address === 'string') {
      return this.#addRecipient(field, address, name);
    }
    this.#message[field] = [...(this.#message[field] ?? []), ...address];
    return this;
  }

  #hasRecipient(field: RecipientField, address: string, name?: string) {
    return (this.#message[field] ?? []).some(
      (recipient) =>
        addressOf(recipient) === address &&
        (name === undefined || nameOf(recipient) === name),
    );
  }

  #attach(attachment: AttachmentOptions): this {
    this.#message.attachments = [
      ...(this.#message.attachments ?? []),
      attachment,
    ];
    return this;
  }
}

const copyOf = (message: NodeMailerMessage): NodeMailerMessage => ({
  ...message,
  ...(message.to ? { to: [...message.to] } : {}),
  ...(message.cc ? { cc: [...message.cc] } : {}),
  ...(message.bcc ? { bcc: [...message.bcc] } : {}),
  ...(message.replyTo ? { replyTo: [...message.replyTo] } : {}),
  ...(message.attachments ? { attachments: [...message.attachments] } : {}),
  ...(message.headers ? { headers: { ...message.headers } } : {}),
});
