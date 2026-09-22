export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits for an answer that is only true eventually — which, in a system where a decision crosses a
 * broker, is most of what a test waits for. Playwright's own `expect` polls the page; this polls the
 * things behind it: a schema, a queue, an event store.
 */
export const until = async <T>(
  condition: () => T | undefined | Promise<T | undefined>,
  timeoutMs = 60_000,
): Promise<T | undefined> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const answer = await condition();
    if (answer) {
      return answer;
    }
    if (Date.now() > deadline) {
      return undefined;
    }
    await sleep(250);
  }
};

/**
 * The API, for the two things this suite still asks it directly: whether it is up, and where it is.
 *
 * Everything else goes through the browser — `apps/web` is the client now, and a suite that talked to
 * GraphQL behind the frontend's back would stop proving that the frontend works.
 */
export class PostsApi {
  constructor(readonly url = process.env.API_URL ?? 'http://localhost:3000') {}

  get graphqlUrl(): string {
    return `${this.url}/graphql`;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(this.graphqlUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
