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

  /**
   * The newest email to `address` whose subject matches, once it has arrived. An email is the far end
   * of a chain of processes — the web publishes, the broker routes, the notificator renders and sends
   * — so it is waited for, never expected.
   */
  async waitFor(
    address: string,
    subject: string | RegExp,
    { timeout = 30_000, after }: { timeout?: number; after?: Set<string> } = {},
  ): Promise<ReceivedMail> {
    const matches = (mail: ReceivedMail) =>
      (typeof subject === 'string'
        ? mail.subject === subject
        : subject.test(mail.subject)) && !after?.has(mail.id);
    const deadline = Date.now() + timeout;
    for (;;) {
      const found = (await this.to(address)).find(matches);
      if (found) return found;
      if (Date.now() > deadline) {
        throw new Error(
          `no email to ${address} matching ${String(subject)} within ${timeout}ms`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
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

/** The first link in the email whose address contains `part`, as a browser would follow it. */
export const linkIn = (mail: ReceivedMail, part: string): string => {
  const link = [...mail.html.matchAll(/href="([^"]+)"/g)]
    .map(([, href]) => href.replace(/&amp;/g, '&'))
    .find((href) => href.includes(part));
  if (!link) {
    throw new Error(`"${mail.subject}" has no link containing ${part}`);
  }
  return link;
};

/** The one-time code an email carries. */
export const codeIn = (mail: ReceivedMail): string => {
  const code = mail.text.match(/^\s*(\d{6})\s*$/m)?.[1];
  if (!code) {
    throw new Error(`"${mail.subject}" carries no six-digit code`);
  }
  return code;
};
