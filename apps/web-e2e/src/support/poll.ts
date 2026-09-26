export class Poll {
  private static readonly INTERVAL_MS = 250;

  static pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Waits for an answer that is only true eventually — which, in a system where a decision crosses a
   * broker, is most of what a test waits for. Playwright's own `expect` polls the page; this polls the
   * things behind it: a schema, a queue, an event store.
   */
  static async until<T>(
    condition: () => T | undefined | Promise<T | undefined>,
    timeoutMs = 60_000,
  ): Promise<T | undefined> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const answer = await condition();
      if (answer) {
        return answer;
      }
      if (Date.now() > deadline) {
        return undefined;
      }
      await Poll.pause(Poll.INTERVAL_MS);
    }
  }
}
