import { Injectable, Logger } from '@nestjs/common';

import {
  isTraceContext,
  isTransportMetadata,
} from '../outbound/message-headers';
import type { ProcessingContext } from '../unit-of-work/processing-context';
import { ResourceKey } from '../unit-of-work/resource-key';
import type {
  MessageDispatchInterceptor,
  MessageDispatchInterceptorChain,
  MessageHandlerInterceptor,
  MessageHandlerInterceptorChain,
} from './interception';
import type { Message, Metadata } from './message';

/**
 * **What a message being handled passes on to everything its handler dispatches** — Axon 5's
 * `CorrelationDataProvider`. The answers of every provider are merged and stamped on each message
 * dispatched in that handler's context ({@link CorrelationDataInterceptor}).
 */
export abstract class CorrelationDataProvider {
  abstract correlationDataFor(message: Message): Metadata;
}

/**
 * **Axon 5's `MessageOriginProvider`**: the correlation id is the one the handled message carries —
 * or its own identifier, when it is where the chain starts — and the causation id is the handled
 * message's identifier. A command sent from a GraphQL mutation is the start of a chain; everything
 * the chain sets off, in every service, carries that command's identifier as its correlation id.
 */
@Injectable()
export class MessageOriginProvider extends CorrelationDataProvider {
  static readonly CORRELATION_ID = 'correlationId';
  static readonly CAUSATION_ID = 'causationId';

  correlationDataFor(message: Message): Metadata {
    return {
      [MessageOriginProvider.CORRELATION_ID]:
        message.metadata[MessageOriginProvider.CORRELATION_ID] ??
        message.identifier,
      [MessageOriginProvider.CAUSATION_ID]: message.identifier,
    };
  }
}

/**
 * **Every key the application put on the message, handed on** — what makes a service in the middle
 * of a chain carry the tenant, a locale or a feature flag onward without knowing any of them exists.
 *
 * Three families are left out, and none of them by taste. The framework's own keys
 * (`cqrs-transport-*`): re-emitting the origin would publish this service's decisions under the
 * previous service's name, and the far side would drop them as its own echo. The trace
 * (`traceparent`, `tracestate`, `baggage`): what this service dispatches is a child of what it is
 * doing now, not a sibling of what it received. And the origin's two ids, which
 * {@link MessageOriginProvider} writes for this hop.
 */
@Injectable()
export class ForwardedMetadataProvider extends CorrelationDataProvider {
  correlationDataFor(message: Message): Metadata {
    return Object.fromEntries(
      Object.entries(message.metadata).filter(
        ([key]) =>
          !isTransportMetadata(key) &&
          !isTraceContext(key) &&
          key !== MessageOriginProvider.CORRELATION_ID &&
          key !== MessageOriginProvider.CAUSATION_ID,
      ),
    );
  }
}

/**
 * **Correlation data, computed where a message is handled and stamped where one is dispatched** —
 * Axon 5's `CorrelationDataInterceptor`, which is both kinds of interceptor at once.
 *
 * Handling a message, it asks every {@link CorrelationDataProvider} and keeps the merged answer in a
 * branch of the context; dispatching one in that context, it merges the answer over the message's
 * metadata. As in Axon, correlation data wins over a key the dispatcher set itself.
 */
export class CorrelationDataInterceptor
  implements MessageHandlerInterceptor, MessageDispatchInterceptor
{
  static readonly CORRELATION_DATA = new ResourceKey<Metadata>(
    'CorrelationData',
  );

  private static readonly logger = new Logger('CorrelationDataInterceptor');

  constructor(private readonly providers: readonly CorrelationDataProvider[]) {}

  /** The correlation data of the message being handled in `context`, if any. */
  static of(context: ProcessingContext | undefined): Metadata | undefined {
    return context?.getResource(CorrelationDataInterceptor.CORRELATION_DATA);
  }

  interceptOnHandle(
    message: Message,
    context: ProcessingContext,
    chain: MessageHandlerInterceptorChain,
  ): Promise<unknown> {
    return chain.proceed(
      message,
      context.withResource(
        CorrelationDataInterceptor.CORRELATION_DATA,
        this.correlationDataFor(message),
      ),
    );
  }

  interceptOnDispatch(
    message: Message,
    context: ProcessingContext | undefined,
    chain: MessageDispatchInterceptorChain,
  ): Message {
    const data = CorrelationDataInterceptor.of(context);
    return chain.proceed(data ? message.andMetadata(data) : message, context);
  }

  private correlationDataFor(message: Message): Metadata {
    let merged: Record<string, string> = {};
    for (const provider of this.providers) {
      try {
        merged = { ...merged, ...provider.correlationDataFor(message) };
      } catch (failure) {
        CorrelationDataInterceptor.logger.warn(
          `${provider.constructor.name} could not answer for ${message.type}: ${
            failure instanceof Error ? failure.message : String(failure)
          }`,
        );
      }
    }
    return merged;
  }
}
