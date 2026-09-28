import { Injectable } from '@nestjs/common';
import { AsyncContext } from '@nestjs/cqrs';

import { ForwardedMetadataProvider } from './messaging/correlation';
import type { Message, Metadata } from './messaging/message';

/**
 * What an application's own request context wants said on the messages dispatched under it. A context
 * that implements it needs no codec of its own.
 *
 * ```ts
 * export class PostRequest extends AsyncContext implements ContextAttributes {
 *   toAttributes() { return { 'x-tenant': this.tenantId }; }
 * }
 * ```
 */
export interface ContextAttributes {
  toAttributes(): Record<string, string>;
}

/**
 * **`@nestjs/cqrs`'s request, and a message's metadata, translated both ways.**
 *
 * In Axon 5 the metadata *is* the request: a handler reads the tenant off the message it handles, and
 * correlation data carries it to whatever it dispatches. `@nestjs/cqrs` has a request of its own —
 * `AsyncContext`, the object a `Scope.REQUEST` handler is resolved in, the one `PostRequest.of(event)`
 * answers — and this is where the two meet:
 *
 * - {@link toMetadata}: what an `AsyncContext` stands for, as metadata. An event raised under one
 *   (`mergeObjectContext(aggregate, request)`) and a command dispatched with one
 *   (`commandBus.execute(command, request)`) carry it.
 * - {@link fromMessage}: the `AsyncContext` a message is handled under, rebuilt from its metadata —
 *   an application's own (`PostRequest`) or the generic {@link TransportRequestContext}.
 *
 * Correlation and causation are not here: they are the unit of work's, stamped by
 * `CorrelationDataInterceptor` from the message being handled, as in Axon.
 */
export abstract class RequestContextCodec {
  abstract toMetadata(context: AsyncContext | undefined): Metadata;

  abstract fromMessage(message: Message): AsyncContext | undefined;
}

/**
 * **The request of a message this application has no request type for** — its metadata, as it
 * arrived. A saga that dispatches a command with it (`AsyncContext.merge(event, command)`) dispatches
 * the application's keys onward, and a guard reads the tenant off it.
 */
export class TransportRequestContext
  extends AsyncContext
  implements ContextAttributes
{
  private static readonly forwarded = new ForwardedMetadataProvider();

  constructor(readonly message: Message) {
    super();
  }

  static override of(target: object): TransportRequestContext | undefined {
    const context = AsyncContext.of(target);
    return context instanceof TransportRequestContext ? context : undefined;
  }

  /** The metadata of the message it was rebuilt from. */
  get metadata(): Metadata {
    return this.message.metadata;
  }

  /** The application's keys only: never the framework's, the trace, or the origin's two ids. */
  toAttributes(): Record<string, string> {
    return {
      ...TransportRequestContext.forwarded.correlationDataFor(this.message),
    };
  }
}

/**
 * The default codec: a context's {@link ContextAttributes} become metadata, and a message becomes a
 * {@link TransportRequestContext}.
 *
 * An application with a request of its own overrides {@link contextFor}:
 *
 * ```ts
 * @Injectable()
 * export class PostRequestContextCodec extends DefaultRequestContextCodec {
 *   protected override contextFor(message: Message) {
 *     const postId = message.metadata[POST_ID_ATTRIBUTE];
 *     return postId ? new PostRequest(PostId.parse(postId), message.metadata['x-tenant']) : undefined;
 *   }
 * }
 * ```
 */
@Injectable()
export class DefaultRequestContextCodec extends RequestContextCodec {
  toMetadata(context: AsyncContext | undefined): Metadata {
    return context && isContextAttributes(context)
      ? context.toAttributes()
      : {};
  }

  fromMessage(message: Message): AsyncContext | undefined {
    return (
      this.contextFor(message) ??
      (Object.keys(message.metadata).length > 0
        ? new TransportRequestContext(message)
        : undefined)
    );
  }

  /** What this application calls a request, rebuilt from the message — `undefined` for the generic one. */
  protected contextFor(_message: Message): AsyncContext | undefined {
    return undefined;
  }
}

const isContextAttributes = (
  context: AsyncContext,
): context is AsyncContext & ContextAttributes =>
  typeof (context as unknown as Partial<ContextAttributes>).toAttributes ===
  'function';
