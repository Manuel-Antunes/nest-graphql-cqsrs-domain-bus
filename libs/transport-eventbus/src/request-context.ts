import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AsyncContext } from '@nestjs/cqrs';

import { isTraceContext, isTransportMetadata } from './outbound/event-envelope';
import type { Ingestion } from './outbound/transport-metadata';

/**
 * **The request that produced an event, crossing the wire.**
 *
 * ## Why an `AsyncContext` is not enough by itself
 * `AsyncContext` is how `@nestjs/cqrs` carries a request through the buses: the edge creates one, a
 * command handler declared `Scope.REQUEST` is resolved *in* it, and an aggregate bound with
 * `publisher.mergeObjectContext(aggregate, request)` stamps it onto every event it raises — which is
 * what `AsyncContext.merge(request, command)` then carries into the next command. But the context is
 * a **process-local** thing: it holds a `ContextId` that Nest's injector understands and nothing
 * outside this process does, and it is attached to a message under a non-enumerable symbol, so it does
 * not even survive `JSON.stringify`.
 *
 * So what travels is not the context, it is **what it stands for**. This codec is the translation, in
 * both directions, and it is the piece that makes a choreographed saga one request instead of several:
 * without it the far side starts fresh, and the chain of "this all happened because of that one
 * mutation" ends at the broker.
 *
 * ## What the far side does with it
 * {@link EventIngestion} publishes the ingested event **with** the restored context, so
 * `AsyncContext.of(event)` answers there exactly as it does here — which is what the sagas in this
 * repository already read (`PostRequest.of(event)`), and what makes a request-scoped handler on the
 * other side resolve in the same request rather than in a new one.
 */
export abstract class RequestContextCodec {
  /** The metadata keys that go on the envelope. Nothing is written when there is no context. */
  abstract encode(
    context: AsyncContext | undefined,
    event: object,
  ): Record<string, string>;

  /** The context an ingested event is published under, or `undefined` for none. */
  abstract decode(message: Ingestion): AsyncContext | undefined;
}

/** The two ids that make a distributed trace out of a chain of messages. */
export const CORRELATION_ID = 'cqrs-transport-correlation-id';
export const CAUSATION_ID = 'cqrs-transport-causation-id';

const CORRELATION = Symbol.for('nestposts.transport-eventbus.correlation');

/**
 * The context an ingested event gets: the request's identity as the wire describes it.
 *
 * `correlationId` is the same value for every message in one request, however many services it
 * crosses; `causationId` is the identifier of the message that caused **this** one. Together they are
 * what lets a log line in the third service be traced back to the mutation in the first.
 *
 * An application with a richer notion of a request subclasses the codec, not this: see
 * `PostRequestContextCodec`.
 */
export class TransportRequestContext
  extends AsyncContext
  implements ContextAttributes
{
  constructor(
    readonly correlationId: string,
    readonly causationId?: string,
    readonly attributes: Readonly<Record<string, string>> = {},
  ) {
    super();
  }

  static override of(target: object): TransportRequestContext | undefined {
    const context = AsyncContext.of(target);
    return context instanceof TransportRequestContext ? context : undefined;
  }

  /**
   * **What arrived on the envelope goes back out on it — the application's half of it.**
   *
   * A service in the middle of a chain republishes under the context it was given, and everything the
   * FIRST service put there — a tenant, a locale, a feature flag — is only still true three hops later
   * because this hands it back to `encode`. Without it a generic context re-emits the trace and drops
   * every attribute, and the far end sees a request that lost its tenant somewhere with nothing in any
   * log to say where.
   *
   * Everything under {@link TRANSPORT_METADATA_PREFIX} is left out, and that exclusion is not tidiness:
   * `cqrs-transport-origin` is the mark that says who AUTHORED the event, and a service that re-emitted
   * the one it received would publish its own decisions under the previous service's name. The far side
   * would then read its own name on them and drop them as its echo — the saga stopping dead, with every
   * message still flowing. The trace ids are excluded by the same rule, and `encode` writes them itself:
   * the causation it writes is this message's, while the one that arrived is the previous hop's.
   *
   * `traceparent` and its companions are excluded for the third time in the same sentence: the
   * envelope factory injects the trace this service is in right now, and the one that arrived names
   * the span that published the message being reacted to — re-emitting it would make every hop a
   * sibling of the first instead of a child of the previous.
   */
  toAttributes(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.attributes).filter(
        ([key]) => !isTransportMetadata(key) && !isTraceContext(key),
      ),
    );
  }
}

/**
 * The default codec: correlation and causation, and nothing application-specific.
 *
 * It is worth having as a default because it costs one line of configuration and answers the question
 * every distributed system is asked eventually — "which request was this?" — for services that have no
 * notion of a request of their own.
 *
 * The correlation id is remembered **on the context**, so every event of one request goes out under
 * the same value; and a context that arrived from another service keeps the id it arrived with, which
 * is what makes it survive any number of hops.
 *
 * ## An application with a request of its own overrides {@link contextFor}, not `decode`
 * Because `decode` is where the arriving correlation id is written onto whatever comes back, and a
 * subclass that replaced it would silently start a **new trace at every hop**: the context it built
 * has no id, `correlationIdOf` generates one, and the chain of "this happened because of that one
 * mutation" ends at the broker — with everything still working, which is what makes it hard to notice.
 */
@Injectable()
export class CorrelatedRequestContext extends RequestContextCodec {
  encode(
    context: AsyncContext | undefined,
    _event: object,
  ): Record<string, string> {
    if (!context) {
      return {};
    }
    const encoded: Record<string, string> = {
      [CORRELATION_ID]: correlationIdOf(context),
    };
    const causationId =
      context instanceof TransportRequestContext
        ? context.causationId
        : undefined;
    if (causationId) {
      encoded[CAUSATION_ID] = causationId;
    }
    return { ...encoded, ...attributesOf(context) };
  }

  decode(message: Ingestion): AsyncContext | undefined {
    const correlationId = message.metadata[CORRELATION_ID];
    const context = this.contextFor(message);

    if (context) {
      return correlationId ? correlate(context, correlationId) : context;
    }
    return correlationId
      ? new TransportRequestContext(
          correlationId,
          message.identifier,
          message.metadata,
        )
      : undefined;
  }

  /**
   * **What this application calls a request, rebuilt from the message** — a `PostRequest`, a tenant, a
   * session. Returning `undefined` (the default) leaves the generic {@link TransportRequestContext},
   * which carries the correlation, the causation and the metadata as it arrived.
   *
   * Whatever it returns is published with the ingested event, so a saga reads it back with its own
   * `of(event)` and a `Scope.REQUEST` handler resolves in it.
   */
  protected contextFor(_message: Ingestion): AsyncContext | undefined {
    return undefined;
  }
}

/**
 * Writes the correlation id a message arrived with onto the context rebuilt for it, so the whole chain
 * keeps one id however many services and however many context classes it passes through.
 */
const correlate = <TContext extends AsyncContext>(
  context: TContext,
  correlationId: string,
): TContext => {
  Object.defineProperty(context, CORRELATION, {
    value: correlationId,
    enumerable: false,
    configurable: true,
  });
  return context;
};

/**
 * The correlation id of a context, generated once and remembered on it — including on a context the
 * application created for its own reasons, which is the common case on the publishing side.
 */
export const correlationIdOf = (context: AsyncContext): string => {
  if (context instanceof TransportRequestContext) {
    return context.correlationId;
  }
  const carrier = context as unknown as Record<symbol, string | undefined>;
  if (!carrier[CORRELATION]) {
    Object.defineProperty(context, CORRELATION, {
      value: randomUUID(),
      enumerable: false,
      configurable: true,
    });
  }
  return carrier[CORRELATION] as string;
};

/**
 * What an application's own context wants on the wire. A context that implements it says so in one
 * method, and needs no codec of its own.
 */
export interface ContextAttributes {
  toAttributes(): Record<string, string>;
}

const attributesOf = (context: AsyncContext): Record<string, string> =>
  typeof (context as unknown as ContextAttributes).toAttributes === 'function'
    ? (context as unknown as ContextAttributes).toAttributes()
    : {};
