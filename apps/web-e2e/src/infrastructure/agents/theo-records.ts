import type { TheoInvocation } from './theo-invocation';

export class TheoRecords {
  constructor(private readonly url: string) {}

  async received(): Promise<TheoInvocation[]> {
    return (await (
      await fetch(`${this.url}/received`)
    ).json()) as TheoInvocation[];
  }

  async lastAsking(text: string): Promise<TheoInvocation | undefined> {
    return (await this.received())
      .filter((invocation) => invocation.asked === text)
      .at(-1);
  }
}
