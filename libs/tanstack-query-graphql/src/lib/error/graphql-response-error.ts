import type { GraphQLFormattedError } from 'graphql';

import { GRAPHQL_CODE_TO_STATUS } from './codes';

/**
 * Cross-realm brand. With Next.js "Optimized SSR" this module can be loaded in
 * more than one dependency graph, so `instanceof` silently fails across
 * contexts — the global `Symbol.for` registry does not.
 */
const BRAND: unique symbol = Symbol.for('app.GraphQLResponseError');

/**
 * How we collapse a multi-error response into the single status we route on:
 * auth interrupts first, because they own dedicated pages.
 */
const STATUS_PRIORITY = [401, 403, 404, 422, 409, 400, 500];

function readNumber(source: unknown, key: string): number | undefined {
  if (source && typeof source === 'object' && key in source) {
    const candidate = (source as Record<string, unknown>)[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function readString(source: unknown, key: string): string | undefined {
  if (source && typeof source === 'object' && key in source) {
    const candidate = (source as Record<string, unknown>)[key];
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return undefined;
}

/** The `extensions.code` a single GraphQL error carries, if any. */
export function codeOfGraphQLError(
  error: GraphQLFormattedError,
): string | undefined {
  return readString(error.extensions, 'code');
}

/**
 * The HTTP status a single GraphQL error carries. Backends spell it three
 * different ways, so we probe all of them before falling back to the code map:
 *
 * - `extensions.status` — our `OrpcGenericFilter` (see `libs/shared`)
 * - `extensions.http.status` — Apollo Server convention
 * - `extensions.originalError.statusCode` — NestJS exceptions serialized by Apollo
 */
export function statusOfGraphQLError(
  error: GraphQLFormattedError,
): number | undefined {
  const extensions = error.extensions;
  if (!extensions) {
    return undefined;
  }

  const direct =
    readNumber(extensions, 'status') ??
    readNumber(extensions['http'], 'status') ??
    readNumber(extensions['originalError'], 'statusCode');
  if (direct !== undefined) {
    return direct;
  }

  const code = codeOfGraphQLError(error);
  if (code && code in GRAPHQL_CODE_TO_STATUS) {
    return GRAPHQL_CODE_TO_STATUS[code];
  }

  return undefined;
}

function hasErrorsArray(
  value: unknown,
): value is { errors: readonly GraphQLFormattedError[] } {
  return (
    !!value &&
    typeof value === 'object' &&
    'errors' in value &&
    Array.isArray((value as { errors: unknown }).errors) &&
    (value as { errors: unknown[] }).errors.length > 0
  );
}

/**
 * Error thrown by the GraphQL `execute` helper for any response carrying an
 * `errors` array. It exposes the same `status` / `code` surface as
 * `@orpc/client`'s `ORPCError`, so `resolveErrorStatus` treats both backends
 * alike — the difference is that here they are *derived* from the per-error
 * `extensions`, since GraphQL answers 200 with an error payload.
 */
export class GraphQLResponseError<TData = unknown> extends Error {
  override readonly name = 'GraphQLResponseError';
  readonly [BRAND] = true;

  constructor(
    readonly errors: readonly GraphQLFormattedError[],
    readonly data: TData | null = null,
    readonly extensions?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(
      errors.map((e) => e.message).join('\n') || 'GraphQL request failed',
      options,
    );
  }

  static is(error: unknown): error is GraphQLResponseError {
    return typeof error === 'object' && error !== null && BRAND in error;
  }

  /**
   * Rebuilds the error from a raw response body — used when the transport
   * fails the request (an Axios 4xx/5xx) but the body is still a GraphQL
   * `{ data, errors }` envelope. Returns `undefined` when it is not.
   */
  static from(
    body: unknown,
    options?: { cause?: unknown },
  ): GraphQLResponseError | undefined {
    if (!hasErrorsArray(body)) {
      return undefined;
    }
    const envelope = body as {
      errors: readonly GraphQLFormattedError[];
      data?: unknown;
      extensions?: Record<string, unknown>;
    };
    return new GraphQLResponseError(
      envelope.errors,
      envelope.data ?? null,
      envelope.extensions,
      options,
    );
  }

  /**
   * Same, for a failed transport call (an AxiosError): the request errored at
   * the HTTP level but the body is still a GraphQL envelope, so the real code
   * is in there. The transport error is kept as `cause`.
   */
  static fromTransportError(error: unknown): GraphQLResponseError | undefined {
    if (!error || typeof error !== 'object' || !('response' in error)) {
      return undefined;
    }
    const body = (error as { response?: { data?: unknown } }).response?.data;
    return GraphQLResponseError.from(body, { cause: error });
  }

  /** A partial response: some fields resolved, others errored. */
  get isPartial() {
    return this.data != null;
  }

  hasCode(code: string) {
    return this.errors.some((e) => e.extensions?.code === code);
  }

  byPath(path: string) {
    return this.errors.filter((e) => e.path?.join('.') === path);
  }

  /** Every `extensions.code` in the response, in payload order. */
  get codes(): string[] {
    return this.errors
      .map(codeOfGraphQLError)
      .filter((code): code is string => code !== undefined);
  }

  /** `ORPCError`-compatible: the code behind {@link status}. */
  get code(): string | undefined {
    const status = this.status;
    const primary = this.errors.find(
      (e) => statusOfGraphQLError(e) === status && codeOfGraphQLError(e),
    );
    return primary ? codeOfGraphQLError(primary) : this.codes[0];
  }

  /**
   * `ORPCError`-compatible: the single HTTP status we route on. When several
   * errors carry a status, the most actionable one wins ({@link STATUS_PRIORITY}).
   */
  get status(): number | undefined {
    const statuses = this.errors
      .map(statusOfGraphQLError)
      .filter((status): status is number => status !== undefined);

    if (statuses.length === 0) {
      return undefined;
    }

    return (
      STATUS_PRIORITY.find((status) => statuses.includes(status)) ?? statuses[0]
    );
  }
}

/** A bare `GraphQLError[]`, which is how a transport reports a refusal. */
function isGraphQLErrorArray(
  value: unknown,
): value is readonly GraphQLFormattedError[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => !!entry && typeof entry === 'object')
  );
}

/**
 * Whatever the transport threw, as an `Error` — and as the SAME error type
 * `execute` throws whenever the payload allows it.
 *
 * `graphql-sse` reports three different things through one callback: an
 * `Error` (the request failed), a bare `GraphQLError[]` (the server refused the
 * operation), or a `CloseEvent`-ish object. Only the first is already an Error.
 * Rebuilding the other two as `GraphQLResponseError` is what makes
 * `resolveErrorStatus` — and every `hasCode` / `status` call site — work on a
 * subscription failure exactly as it does on a query one.
 */
export function normalizeSubscriptionError(error: unknown): Error {
  if (GraphQLResponseError.is(error)) {
    return error;
  }
  if (isGraphQLErrorArray(error)) {
    return new GraphQLResponseError(error);
  }
  if (error instanceof Error) {
    return error;
  }
  const fromEnvelope = GraphQLResponseError.from(error);
  if (fromEnvelope) {
    return fromEnvelope;
  }

  const reason =
    error && typeof error === 'object' && 'reason' in error
      ? String((error as { reason: unknown }).reason)
      : undefined;

  return new Error(reason || 'GraphQL subscription failed', { cause: error });
}
