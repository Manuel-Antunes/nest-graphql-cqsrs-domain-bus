export const MAILPIT_IMAGE = 'axllent/mailpit:latest';
export const MAILPIT_SMTP_PORT = 1025;
export const MAILPIT_API_PORT = 8025;

export const mailboxUrl = (): string =>
  process.env.E2E_MAILBOX_URL ?? `http://localhost:${MAILPIT_API_PORT}`;

interface MailpitAddress {
  Address: string;
  Name: string;
}

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: MailpitAddress[];
  From: MailpitAddress;
}

export interface ReceivedMail {
  id: string;
  subject: string;
  from: string;
  to: string[];
  html: string;
  text: string;
}

/**
 * The inbox every email of the stack lands in — Mailpit's REST API, read from outside it.
 *
 * It is how a test proves an email was SENT rather than that a service meant to send one: what is
 * here went through SMTP, rendered, from the notificator's container.
 */
export class Mailbox {
  constructor(private readonly url: string = mailboxUrl()) {}

  async to(address: string): Promise<ReceivedMail[]> {
    const response = await fetch(
      `${this.url}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
    );
    if (!response.ok) {
      throw new Error(`Mailpit search failed (${response.status})`);
    }
    const { messages } = (await response.json()) as {
      messages: MailpitSummary[];
    };
    return Promise.all(messages.map((summary) => this.read(summary.ID)));
  }

  async read(id: string): Promise<ReceivedMail> {
    const response = await fetch(`${this.url}/api/v1/message/${id}`);
    if (!response.ok) {
      throw new Error(`Mailpit could not read ${id} (${response.status})`);
    }
    const message = (await response.json()) as {
      ID: string;
      Subject: string;
      From: MailpitAddress;
      To: MailpitAddress[];
      HTML: string;
      Text: string;
    };
    return {
      id: message.ID,
      subject: message.Subject,
      from: message.From.Address,
      to: message.To.map((to) => to.Address),
      html: message.HTML,
      text: message.Text,
    };
  }
}
