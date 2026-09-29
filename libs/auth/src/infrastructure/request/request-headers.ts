type HeadersLike = {
  forEach(callback: (value: string, name: string) => void): void;
  get(name: string): string | null;
};

type Carrier = {
  headers?: unknown;
  handshake?: { headers?: unknown };
  req?: Carrier;
  request?: Carrier;
};

/**
 * **The headers of whatever a transport calls "the request"** — the one place that knows its shapes.
 *
 * `@Inject(REQUEST)`, a guard and a GraphQL context function each hold something different: a
 * Fastify or Express request (a plain object of headers), a GraphQL context (`{ req }`, and Yoga's
 * `{ req, request }`, whose `request.headers` is `@whatwg-node`'s `Headers` and not the global
 * class), a Socket.IO client (`handshake.headers`), or a microservice message with no headers at all.
 * Better Auth asks for one thing, a global `Headers`, and this is where every one of them becomes it.
 */
export class RequestHeaders {
  /**
   * The object that carries the headers — the request itself, or the one a GraphQL context holds.
   * It is also what the global guard writes the session on, which makes it the key anything
   * remembered per request is kept under.
   */
  static requestOf(source: unknown): object | undefined {
    if (!source || typeof source !== 'object') {
      return undefined;
    }
    const carrier = source as Carrier;
    if (carrier.headers !== undefined || carrier.handshake !== undefined) {
      return carrier;
    }
    return carrier.req ?? carrier.request;
  }

  /**
   * A request with nothing to read yields an EMPTY `Headers` rather than throwing: a message off a
   * broker legitimately carries no session, and the answer to "who is this?" there is nobody, not a
   * crash.
   */
  static from(source: unknown): Headers {
    const carrier = RequestHeaders.requestOf(source) as Carrier | undefined;
    const raw = carrier?.headers ?? carrier?.handshake?.headers;

    if (raw instanceof Headers) {
      return raw;
    }

    const headers = new Headers();
    if (RequestHeaders.isHeadersLike(raw)) {
      raw.forEach((value, name) => {
        headers.append(name, value);
      });
      return headers;
    }
    if (!raw || typeof raw !== 'object') {
      return headers;
    }
    for (const [name, value] of Object.entries(
      raw as Record<string, unknown>,
    )) {
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          headers.append(name, String(entry));
        });
      } else if (value !== undefined && value !== null) {
        headers.set(name, String(value));
      }
    }
    return headers;
  }

  private static isHeadersLike(raw: unknown): raw is HeadersLike {
    return (
      typeof (raw as Partial<HeadersLike> | undefined)?.forEach ===
        'function' &&
      typeof (raw as Partial<HeadersLike> | undefined)?.get === 'function'
    );
  }
}
