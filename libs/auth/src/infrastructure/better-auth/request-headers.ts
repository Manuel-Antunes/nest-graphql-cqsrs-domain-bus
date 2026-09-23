/**
 * **The headers of whatever Nest calls "the request" here.**
 *
 * `@Inject(REQUEST)` hands over a different shape per transport: the Express request over HTTP, the
 * GraphQL context (`{ req }`) inside a resolver, and the message itself on a microservice — which has
 * no headers at all. Better Auth asks for one thing, a `Headers`, so this is where the three become
 * it, once, in a constructor.
 */
type HeaderCarrier = {
  headers?: unknown;
  req?: { headers?: unknown };
  request?: { headers?: unknown };
};

export class RequestHeaders {
  /**
   * A request with nothing to read yields an EMPTY `Headers` rather than throwing: a message off a
   * broker legitimately carries no session, and the answer to "who is this?" there is nobody, not a
   * crash.
   */
  static from(request: unknown): Headers {
    const raw = RequestHeaders.rawOf(request);

    if (raw instanceof Headers) {
      return raw;
    }

    const headers = new Headers();
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

  private static rawOf(request: unknown): unknown {
    if (!request || typeof request !== 'object') {
      return undefined;
    }
    const carrier = request as HeaderCarrier;
    return carrier.headers ?? carrier.req?.headers ?? carrier.request?.headers;
  }
}
