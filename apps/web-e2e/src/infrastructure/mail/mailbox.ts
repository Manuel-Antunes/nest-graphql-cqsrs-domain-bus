import { Poll } from '../../support/poll';
import { ReceivedMail } from './received-mail';

interface MailpitAddress {
  Address: string;
  Name: string;
}

interface MailpitSummary {
  ID: string;
}

interface MailpitMessage {
  ID: string;
  Subject: string;
  From: MailpitAddress;
  To: MailpitAddress[];
  HTML: string;
  Text: string;
}

export interface WaitForMail {
  readonly timeout?: number;
  readonly after?: Set<string>;
}

/**
 * The inbox every email of the stack lands in — Mailpit's REST API, read from outside it.
 *
 * It is how a test proves an email was SENT rather than that a service meant to send one: what is
 * here went through SMTP, rendered, from the notificator's container.
 */
export class Mailbox {
  constructor(private readonly url: string) {}

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

  async withSubject(address: string, subject: string): Promise<ReceivedMail[]> {
    return (await this.to(address)).filter((mail) => mail.subject === subject);
  }

  async withSubjectContaining(
    address: string,
    part: string,
  ): Promise<ReceivedMail[]> {
    return (await this.to(address)).filter((mail) =>
      mail.subject.includes(part),
    );
  }

  /**
   * The newest email to `address` whose subject matches, once it has arrived. An email is the far end
   * of a chain of processes — the web publishes, the broker routes, the notificator renders and sends
   * — so it is waited for, never expected.
   */
  async waitFor(
    address: string,
    subject: string | RegExp,
    { timeout = 30_000, after }: WaitForMail = {},
  ): Promise<ReceivedMail> {
    const matches = (mail: ReceivedMail) =>
      (typeof subject === 'string'
        ? mail.subject === subject
        : subject.test(mail.subject)) && !after?.has(mail.id);
    const found = await Poll.until(
      async () => (await this.to(address)).find(matches),
      timeout,
    );
    if (!found) {
      throw new Error(
        `no email to ${address} matching ${String(subject)} within ${timeout}ms`,
      );
    }
    return found;
  }

  /** The ids of what `address` has received so far — to wait for the NEXT one after an action. */
  async idsOf(address: string): Promise<Set<string>> {
    return new Set((await this.to(address)).map((mail) => mail.id));
  }

  async read(id: string): Promise<ReceivedMail> {
    const response = await fetch(`${this.url}/api/v1/message/${id}`);
    if (!response.ok) {
      throw new Error(`Mailpit could not read ${id} (${response.status})`);
    }
    const message = (await response.json()) as MailpitMessage;
    return new ReceivedMail(
      message.ID,
      message.Subject,
      message.From.Address,
      message.To.map((to) => to.Address),
      message.HTML,
      message.Text,
    );
  }
}
