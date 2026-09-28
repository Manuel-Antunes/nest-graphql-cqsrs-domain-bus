import { Injectable, Optional } from '@nestjs/common';
import { AsyncContext, EventBus } from '@nestjs/cqrs';

import type { EventMessage } from '../messaging/event-message';
import { Message } from '../messaging/message';
import { MessageInterceptors } from '../messaging/message-interceptors';
import { RequestContextCodec } from '../request-context';
import { ProcessingContext } from '../unit-of-work/processing-context';
import { CommittedEvents } from './committed-events';
import type { DeliveryFailure } from './delivery-scope';
import { DeliveryScope } from './delivery-scope';
import { ProcessingGroups } from './processing-groups';

/**
 * **This process's handlers, told an event** — Axon 5's `SubscribingEventProcessor`, over
 * `@nestjs/cqrs`'s `EventBus`.
 *
 * Each message is handled in a branch of the unit's context holding the message and a
 * {@link DeliveryScope}, behind the handler interceptors — so the correlation data of the event is what
 * a saga's command is stamped with — and published on the `EventBus` in it. The delivery then waits
 * for every handler and every command they dispatched, and hands each failure to its group's
 * {@link ErrorHandler}: by default the failure is the unit's, which rolls back.
 *
 * The bus delivers to the **subscribing** groups in its `PREPARE_COMMIT`; a streaming group's
 * delivery, from the outbox, delivers to that group alone.
 */
@Injectable()
export class LocalEventDelivery {
  constructor(
    private readonly eventBus: EventBus,
    private readonly interceptors: MessageInterceptors,
    private readonly codec: RequestContextCodec,
    private readonly groups: ProcessingGroups,
    @Optional() private readonly committed?: CommittedEvents,
  ) {}

  /** Delivers to the subscribing groups, or to `processingGroup` alone, one message after the other. */
  async deliver(
    context: ProcessingContext,
    messages: readonly EventMessage[],
    processingGroup?: string,
  ): Promise<void> {
    for (const message of messages) {
      const scope = processingGroup
        ? DeliveryScope.streaming(processingGroup)
        : DeliveryScope.subscribing((group) => this.groups.isStreaming(group));
      const branch = Message.addToContext(context, message).withResource(
        DeliveryScope.KEY,
        scope,
      );
      if (processingGroup) {
        this.committed?.withhold(message.payload);
      } else {
        this.committed?.after(context, message.payload);
      }
      await this.interceptors.handle(
        message,
        branch,
        async (handled, handling) => {
          ProcessingContext.runIn(handling, () =>
            this.publish(handled as EventMessage),
          );
          await this.adjudicate(
            await scope.settle(),
            handled as EventMessage,
            handling,
          );
        },
      );
    }
  }

  /**
   * Straight onto the `EventBus`, with no unit of work — what `publish` does when nothing opened one
   * and nothing has to be written first. Axon's `SimpleEventBus.publish(null, events)` does the same.
   */
  immediately(messages: readonly EventMessage[]): void {
    for (const message of messages) {
      this.publish(message);
    }
  }

  private publish(message: EventMessage): void {
    const context =
      AsyncContext.of(message.payload) ?? this.codec.fromMessage(message);
    if (context) {
      this.eventBus.publish(message.payload, context);
      return;
    }
    this.eventBus.publish(message.payload);
  }

  private async adjudicate(
    failures: readonly DeliveryFailure[],
    message: EventMessage,
    context: ProcessingContext,
  ): Promise<void> {
    for (const { processingGroup, error } of failures) {
      await this.groups
        .errorHandlerFor(processingGroup)
        .handleError({ processingGroup, error, message, context });
    }
  }
}
