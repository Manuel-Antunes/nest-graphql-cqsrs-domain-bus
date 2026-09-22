/** One tag of the event: the property `@EventType` declared, and its value on this instance. */
export interface WireTag {
  readonly key: string;
  readonly value: string;
}

/** What the envelope carries beside the event: a flat map, because that is what a header is. */
export type EnvelopeMetadata = Record<string, string>;

/**
 * **The prefix this integration reserves on the envelope's metadata.**
 *
 * Every key below, and the codec's correlation and causation, start with it — so "is this key the
 * framework's or the application's?" is answerable without a list to keep in step. What that question
 * decides is {@link TransportRequestContext.toAttributes}: a service in the middle of a chain carries
 * the APPLICATION's attributes onward and must not carry these, because re-emitting
 * {@link TRANSPORT_ORIGIN} would republish somebody else's authorship — and the origin mark is the
 * one thing standing between "every service forwards what it receives" and an endless loop.
 */
export const TRANSPORT_METADATA_PREFIX = 'cqrs-transport-';

/** Whether a metadata key belongs to this integration rather than to the application. */
export const isTransportMetadata = (key: string): boolean =>
  key.startsWith(TRANSPORT_METADATA_PREFIX);

/** W3C trace context, and the baggage that travels with it — the keys a propagator reads and writes. */
const TRACE_CONTEXT_KEYS = new Set(['traceparent', 'tracestate', 'baggage']);

/**
 * Whether a metadata key belongs to the **trace** rather than to the application.
 *
 * It answers the same question {@link isTransportMetadata} does, for the same reason: a service in
 * the middle of a chain re-emits what arrived, and re-emitting the PREVIOUS hop's `traceparent`
 * would make everything it publishes a sibling of the message it received instead of a child of what
 * it is doing now. The trace stays one trace, which is what makes it hard to notice — the causality
 * is just wrong, with every service's work hanging off the first one. `injectTraceContext` writes
 * the current one instead, at the moment the envelope is built.
 */
export const isTraceContext = (key: string): boolean => TRACE_CONTEXT_KEYS.has(key.toLowerCase());

/** `namespace.Name#version` — what the other side resolves the class by. */
export const TRANSPORT_MESSAGE_TYPE = 'cqrs-transport-message-type';

/** One per event instance: what gives the receiver idempotency. */
export const TRANSPORT_IDENTIFIER = 'cqrs-transport-identifier';

/** ISO-8601, so the reconstructed event keeps the instant it happened and not the one it arrived. */
export const TRANSPORT_TIMESTAMP = 'cqrs-transport-timestamp';

/** The service that produced the event — the mark that cuts the publish/ingest loop. */
export const TRANSPORT_ORIGIN = 'cqrs-transport-origin';

/** The event's tags, flattened — see {@link encodeTags}. */
export const TRANSPORT_TAGS = 'cqrs-transport-tags';

/** The key a `Date` travels under inside {@link EventEnvelope.data}. */
const DATE = '@date';

/**
 * **What crosses: the event, and what is said about it.** Two properties, and the split is the whole
 * idea.
 *
 * | | |
 * |---|---|
 * | {@link data} | the application's own message — its fields, and nothing this library added |
 * | {@link metadata} | who sent it, what it is called on the wire, which aggregate it is about, and the request it belongs to |
 *
 * ## Why they are separate, and why metadata is a flat map of strings
 * Because every transport already has a place for exactly this pair: a body and headers. RabbitMQ
 * takes `Record<string, string>` headers (`RmqRecordOptions`), Kafka takes headers, NATS takes them,
 * and HTTP is made of them. Keeping the metadata a flat map means each transport's serializer *maps*
 * it — `new RmqRecordBuilder(data).setOptions({ headers: metadata })` — instead of inventing an
 * encoding for it, and a broker's management UI, a log or a dead-letter queue shows the routing facts
 * without anybody decoding a payload.
 *
 * It also makes the body **the event**: `data` is what the application sent, readable as itself. The
 * previous shape buried it as base64 inside a bigger object, which made every message opaque to
 * everything except this library.
 *
 * ## Why the fields are accessors over metadata
 * So there is one representation. `envelope.messageType` reads the header the wire carries, rather
 * than a second copy of it that could disagree — and adding a fact to the envelope is adding a key,
 * not a constructor parameter every transport then has to learn.
 */
export class EventEnvelope<TData = unknown> {
  constructor(
    readonly data: TData,
    readonly metadata: EnvelopeMetadata,
  ) {}

  get messageType(): string {
    return this.metadata[TRANSPORT_MESSAGE_TYPE] ?? '';
  }

  get identifier(): string {
    return this.metadata[TRANSPORT_IDENTIFIER] ?? '';
  }

  get timestamp(): string {
    return this.metadata[TRANSPORT_TIMESTAMP] ?? '';
  }

  get origin(): string | undefined {
    return this.metadata[TRANSPORT_ORIGIN];
  }

  get tags(): readonly WireTag[] {
    return decodeTags(this.metadata[TRANSPORT_TAGS]);
  }

  /** The same envelope with its body encoded for the wire — see {@link encodeData}. */
  encoded(): EventEnvelope<Record<string, unknown>> {
    return new EventEnvelope(encodeData(this.data as object), this.metadata);
  }

  /** The same envelope with its body read back off the wire — dates included. */
  decoded(): EventEnvelope<Record<string, unknown>> {
    return new EventEnvelope(decodeData(this.data), this.metadata);
  }
}

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
    JSON.stringify(body, function (this: Record<string, unknown>, key, value: unknown) {
      const raw = this[key];
      return raw instanceof Date ? { [DATE]: raw.toISOString() } : value;
    }) ?? 'null',
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
  tags.map((tag) => `${encodeURIComponent(tag.key)}=${encodeURIComponent(tag.value)}`).join(';');

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
    if (entries.length === 1 && entries[0][0] === DATE && typeof entries[0][1] === 'string') {
      return new Date(entries[0][1]);
    }
    return Object.fromEntries(entries.map(([key, nested]) => [key, revive(nested)]));
  }
  return value;
};
