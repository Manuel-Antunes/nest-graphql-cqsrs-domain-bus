export class ReceivedMail {
  constructor(
    readonly id: string,
    readonly subject: string,
    readonly from: string,
    readonly to: string[],
    readonly html: string,
    readonly text: string,
  ) {}

  /** The first link in the email whose address contains `part`, as a browser would follow it. */
  link(part: string): string {
    const link = [...this.html.matchAll(/href="([^"]+)"/g)]
      .map(([, href]) => href.replace(/&amp;/g, '&'))
      .find((href) => href.includes(part));
    if (!link) {
      throw new Error(`"${this.subject}" has no link containing ${part}`);
    }
    return link;
  }

  /** The one-time code an email carries. */
  oneTimeCode(): string {
    const code = this.text.match(/^\s*(\d{6})\s*$/m)?.[1];
    if (!code) {
      throw new Error(`"${this.subject}" carries no six-digit code`);
    }
    return code;
  }
}
