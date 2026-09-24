import type { Mail } from './mail';

/** What the transport answered for one sent email. */
export interface SentMail {
  messageId: string;
  envelope: { from: string | false; to: string[] };
  /** The transport's own answer: an SMTP response line, an SES message id, or the JSON message. */
  response: unknown;
}

/**
 * The port through which anything sends a {@link Mail}.
 *
 * `MailModule` binds it to the `@nestjs-modules/mailer` adapter; a spec can bind
 * `RecordingMailSender` from `@nestposts/mail/testing/recording-mail-sender` instead.
 */
export abstract class MailSender {
  abstract send(mail: Mail): Promise<SentMail>;
}
