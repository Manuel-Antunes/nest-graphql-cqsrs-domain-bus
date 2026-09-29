import { RequestHeaders } from './request-headers';

/**
 * **What a request presents to be recognised**: its `cookie` and its `authorization`, and nothing
 * else — Better Auth's session cookie, and an OAuth access token as a bearer.
 *
 * Whoever needs the caller's credentials without resolving them reads them here: the identity
 * resolver, to skip a lookup for a caller who sent none; the gateway, to forward them to every
 * subgraph; the response cache, to keep one caller's answers from another.
 */
export class RequestCredentials {
  static readonly HEADERS = ['cookie', 'authorization'] as const;

  private constructor(
    private readonly presented: Readonly<Record<string, string>>,
  ) {}

  /** The credentials of any request shape {@link RequestHeaders} reads. */
  static of(request: unknown): RequestCredentials {
    const headers = RequestHeaders.from(request);
    return new RequestCredentials(
      Object.fromEntries(
        RequestCredentials.HEADERS.flatMap((name) => {
          const value = headers.get(name);
          return value ? [[name, value]] : [];
        }),
      ),
    );
  }

  /** The caller as the credentials it sent — `null` for one who sent none. What a cache keys by. */
  static keyOf(request: unknown): string | null {
    return RequestCredentials.of(request).key;
  }

  get isAnonymous(): boolean {
    return Object.keys(this.presented).length === 0;
  }

  get key(): string | null {
    return this.isAnonymous ? null : Object.values(this.presented).join('\n');
  }

  /** The credentials as headers, to forward them as they arrived. */
  toHeaders(): Readonly<Record<string, string>> {
    return this.presented;
  }
}
