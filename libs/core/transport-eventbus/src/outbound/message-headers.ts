/** One tag of the event: the property `@EventType` declared, and its value on this instance. */
export interface WireTag {
  readonly key: string;
  readonly value: string;
}

/**
 * **What a message says about itself, beside its payload**: the `headers` of `@nestjs/outbox`'s
 * `OutboxEnvelope`. A flat map of strings, because that is what a header is on every transport —
 * RabbitMQ's AMQP headers, SNS's message attributes, Inngest's `user` — so each transport's packet
 * maps it rather than inventing an encoding, and a broker's management UI, a log or a dead-letter
 * queue shows the routing facts without anybody decoding a payload.
 *
 * The message's identity is not here: it is the envelope's `id`, the outbox message's own, which is
 * what every consumer's inbox deduplicates by.
 */
export type MessageHeaders = Record<string, string>;

/**
 * **The prefix this integration reserves on a message's headers.**
 *
 * Every key below, and the codec's correlation and causation, start with it — so "is this key the
 * framework's or the application's?" is answerable without a list to keep in step. What that question
 * decides is {@link TransportRequestContext.toAttributes}: a service in the middle of a chain carries
 * the APPLICATION's attributes onward and must not carry these, because re-emitting
 * {@link TRANSPORT_ORIGIN} would republish somebody else's authorship — and the origin mark is the
 * one thing standing between "every service forwards what it receives" and an endless loop.
 */
export const TRANSPORT_METADATA_PREFIX = 'cqrs-transport-';

/** Whether a header belongs to this integration rather than to the application. */
export const isTransportMetadata = (key: string): boolean =>
  key.startsWith(TRANSPORT_METADATA_PREFIX);

/** W3C trace context, and the baggage that travels with it — the keys a propagator reads and writes. */
const TRACE_CONTEXT_KEYS = new Set(['traceparent', 'tracestate', 'baggage']);

/**
 * Whether a header belongs to the **trace** rather than to the application.
 *
 * It answers the same question {@link isTransportMetadata} does, for the same reason: a service in
 * the middle of a chain re-emits what arrived, and re-emitting the PREVIOUS hop's `traceparent`
 * would make everything it publishes a sibling of the message it received instead of a child of what
 * it is doing now. The trace stays one trace, which is what makes it hard to notice — the causality
 * is just wrong, with every service's work hanging off the first one. `injectTraceContext` writes
 * the current one instead, at the moment the message is staged.
 */
export const isTraceContext = (key: string): boolean =>
  TRACE_CONTEXT_KEYS.has(key.toLowerCase());

/** `namespace.Name#version` — what the other side resolves the class by. */
export const TRANSPORT_MESSAGE_TYPE = 'cqrs-transport-message-type';

/** ISO-8601, so the reconstructed event keeps the instant it happened and not the one it arrived. */
export const TRANSPORT_TIMESTAMP = 'cqrs-transport-timestamp';

/** The service that produced the event — the mark that cuts the publish/ingest loop. */
export const TRANSPORT_ORIGIN = 'cqrs-transport-origin';

/** The event's tags, flattened — see {@link encodeTags}. */
export const TRANSPORT_TAGS = 'cqrs-transport-tags';

/** The key a `Date` travels under inside a payload — see {@link encodeData}. */
const DATE = '@date';

/**
 * The event's own fields, ready for `JSON.stringify`.
 *
 * ## Why a `Date` is tagged
 * A `Date` survives `JSON.stringify` as a string, and JavaScript has no field types at runtime to turn
 * it back into a `Date` — so `occurredAt` would arrive as a string, and the first aggregate that did
 * arithmetic on it would produce nonsense. Java does not have this problem (Jackson reads the declared
 * type), so this is one place where the port must add something the original does not need: a `Date`
 * goes out as `{"@date":"…"}` and comes back a `Date`.
 *
 * A replacer cannot see the `Date` itself — `Date.prototype.toJSON` has already run by then — so it
 * reads the raw value off the holder, which `this` is bound to.
 */
export const encodeData = (body: object): Record<string, unknown> =>
  JSON.parse(
    JSON.stringify(
      body,
      function (this: Record<string, unknown>, key, value: unknown) {
        const raw = this[key];
        return raw instanceof Date ? { [DATE]: raw.toISOString() } : value;
      },
    ) ?? 'null',
  ) as Record<string, unknown>;

/** The body as the application wrote it: every tagged date is a `Date` again. */
export const decodeData = (body: unknown): Record<string, unknown> =>
  (revive(body) ?? {}) as Record<string, unknown>;

/**
 * `key=value;key=value`, percent-encoded. Not JSON on purpose: this ends up in a header, in logs and,
 * when a transport persists it, on disk — and a format one can read at a glance is worth more here
 * than one that saves bytes. The encoding is what keeps a value containing `;` or `=` from splitting
 * the record in two.
 */
export const encodeTags = (tags: readonly WireTag[]): string =>
  tags
    .map(
      (tag) =>
        `${encodeURIComponent(tag.key)}=${encodeURIComponent(tag.value)}`,
    )
    .join(';');

export const decodeTags = (encoded: string | undefined): WireTag[] =>
  !encoded
    ? []
    : encoded
        .split(';')
        .map((pair) => {
          const separator = pair.indexOf('=');
          return separator > 0
            ? {
                key: decodeURIComponent(pair.slice(0, separator)),
                value: decodeURIComponent(pair.slice(separator + 1)),
              }
            : undefined;
        })
        .filter((tag): tag is WireTag => tag !== undefined);

const revive = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(revive);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (
      entries.length === 1 &&
      entries[0][0] === DATE &&
      typeof entries[0][1] === 'string'
    ) {
      return new Date(entries[0][1]);
    }
    return Object.fromEntries(
      entries.map(([key, nested]) => [key, revive(nested)]),
    );
  }
  return value;
};
