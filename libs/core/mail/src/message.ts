import { basename } from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { TemplateResolver } from '@nestjs-modules/mailer';
import type { ICalCalendar } from 'ical-generator';
import ical, { ICalCalendarMethod } from 'ical-generator';
import type { SendMailOptions } from 'nodemailer';

import type { EmailTemplate } from './email-template';

/** An address, bare or with a display name. */
export type Recipient = { address: string; name: string } | string;

/** One attachment, exactly as nodemailer takes it. */
export type AttachmentOptions = Exclude<
  SendMailOptions['attachments'],
  undefined
>[number];

/** What an iCalendar file is for, as RFC 5546 names it: `REQUEST` invites, `CANCEL` calls off. */
export type CalendarEventMethod =
  | 'PUBLISH'
  | 'REQUEST'
  | 'REPLY'
  | 'ADD'
  | 'CANCEL'
  | 'REFRESH'
  | 'COUNTER'
  | 'DECLINECOUNTER';

/** How an iCalendar event travels: its method, its file name, the encoding of its content. */
export interface CalendarEventOptions {
  method?: CalendarEventMethod;
  filename?: string;
  encoding?: string;
}

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
  icalEvent?: CalendarEventOptions & {
    content?: string;
    path?: string;
    href?: string;
  };
}

/**
 * A template to render a body with, by NAME, and the data it is rendered with. A view is plain data
 * until it is rendered, so a message built in one process can be rendered in another that knows the
 * same template.
 */
export interface MessageView {
  template: string;
  data: Record<string, unknown>;
}

/** The views a message's bodies are rendered from: the HTML, and its plain-text alternative. */
export interface MessageBodyTemplates {
  html?: MessageView;
  text?: MessageView;
}

/** What a built message is: the nodemailer fields, and the views its bodies are rendered from. */
export interface CompiledMessage {
  message: NodeMailerMessage;
  views: MessageBodyTemplates;
}

type RecipientField = 'to' | 'cc' | 'bcc' | 'replyTo';

type ViewTemplate = { name: string } | string;

const templateNameOf = (template: ViewTemplate): string =>
  typeof template === 'string' ? template : template.name;

const viewOf = (template: ViewTemplate, data: object): MessageView => ({
  template: templateNameOf(template),
  data: { ...data } as Record<string, unknown>,
});

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
 *   .htmlView(PostCreatedEmail, { title, url })
 *   .textView(PostCreatedEmail.text, { title, url });
 * ```
 *
 * Each body is either set directly — {@link html}, {@link text} — or rendered from a view —
 * {@link htmlView}, {@link textView} — and the one set directly wins. A view is rendered when the
 * message is sent, by the mailer, unless {@link computeContents} rendered it first.
 */
export class Message {
  readonly #message: NodeMailerMessage = {};
  readonly #views: MessageBodyTemplates = {};

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

  /** Sets the HTML body directly, which takes precedence over an {@link htmlView}. */
  html(content: string): this {
    this.#message.html = content;
    return this;
  }

  /** Sets the plain-text body directly, which takes precedence over a {@link textView}. */
  text(content: string): this {
    this.#message.text = content;
    return this;
  }

  /**
   * Renders the HTML body from a template: sent as it is, it is the mailer's `template`, rendered by
   * its resolver or its adapter; {@link computeContents} renders it earlier.
   *
   * A React Email template is passed as what `defineEmailTemplate` returned, which types its props; any
   * other engine's by the name it knows the template by. Either way the data must be plain: the
   * message is serialised before it is rendered.
   */
  htmlView<P extends object>(template: EmailTemplate<P, false>, props: P): this;
  htmlView(template: string, data?: Record<string, unknown>): this;
  htmlView(template: ViewTemplate, data: object = {}): this {
    this.#views.html = viewOf(template, data);
    return this;
  }

  /**
   * Renders the plain-text body from a template: sent as it is, it is the mailer's `textTemplate`,
   * resolved by its template resolver when it has one; {@link computeContents} renders it earlier.
   *
   * A React Email template's is its `text` — the component `htmlView` names, rendered again as plain
   * text. Without a text body or a text view, `plainTextFromHtml` writes the text part from the HTML.
   */
  textView<P extends object>(template: EmailTemplate<P, true>, props: P): this;
  textView(template: string, data?: Record<string, unknown>): this;
  textView(template: ViewTemplate, data: object = {}): this {
    this.#views.text = viewOf(template, data);
    return this;
  }

  /**
   * Renders the views now, through the mailer's resolver contract: the HTML view into the HTML body
   * and the text view into the text body, each with its own data, and each unless that body was set
   * directly. Called in a mail's `prepare`, the mail leaves already rendered and the mailer sends the
   * bodies as they are; left uncalled, the views are rendered when the message is sent.
   */
  async computeContents(resolver: TemplateResolver): Promise<this> {
    const { html, text } = this.#views;
    if (!this.#message.html && html) {
      this.#message.html = (
        await resolver.resolve(html.template, html.data)
      ).content;
    }
    if (!this.#message.text && text) {
      this.#message.text = (
        await resolver.resolve(text.template, text.data)
      ).content;
    }
    return this;
  }

  /**
   * Attaches an iCalendar event — an invitation, its update, its cancellation — as the message's
   * `text/calendar` alternative, which a mail client offers to put on the calendar.
   *
   * Given a function, it is handed an `ical-generator` calendar to fill, created with the method the
   * options name, so that the file's `METHOD` and the MIME part's agree; given a string, that string is
   * the `.ics`.
   *
   * ```ts
   * this.message.icalEvent(
   *   (calendar) => calendar.createEvent({ id, sequence, start, end, summary, organizer, attendees }),
   *   { method: 'REQUEST' },
   * );
   * ```
   */
  icalEvent(
    contents: ((calendar: ICalCalendar) => void) | string,
    options: CalendarEventOptions = {},
  ): this {
    this.#message.icalEvent = {
      content:
        typeof contents === 'string'
          ? contents
          : Message.calendarOf(contents, options),
      ...options,
    };
    return this;
  }

  /** Attaches an iCalendar event from a `.ics` on disk. */
  icalEventFromFile(
    file: string | URL,
    options: CalendarEventOptions = {},
  ): this {
    this.#message.icalEvent = {
      path: typeof file === 'string' ? file : fileURLToPath(file),
      ...options,
    };
    return this;
  }

  /** Attaches an iCalendar event nodemailer fetches from a URL when it sends. */
  icalEventFromUrl(url: string, options: CalendarEventOptions = {}): this {
    this.#message.icalEvent = { href: url, ...options };
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

  hasHtmlView<P extends object>(template: EmailTemplate<P> | string): boolean {
    return this.#views.html?.template === templateNameOf(template);
  }

  hasTextView<P extends object>(template: EmailTemplate<P> | string): boolean {
    return this.#views.text?.template === templateNameOf(template);
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

  /** The message as plain data: what `MailService` hands to the mailer, and what a queue could carry. */
  toObject(): CompiledMessage {
    const { html, text } = this.#views;
    return {
      message: copyOf(this.#message),
      views: {
        ...(html ? { html: { ...html } } : {}),
        ...(text ? { text: { ...text } } : {}),
      },
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

  private static calendarOf(
    fill: (calendar: ICalCalendar) => void,
    { method }: CalendarEventOptions,
  ): string {
    const calendar = ical(method ? { method: ICalCalendarMethod[method] } : {});
    fill(calendar);
    return calendar.toString();
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
  ...(message.icalEvent ? { icalEvent: { ...message.icalEvent } } : {}),
});
