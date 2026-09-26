import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type {
  AttachmentEvent,
  AttachmentEventPayloads,
} from '../../domain/events/variant-generation.events';

/**
 * Emits the attachment lifecycle on `@nestjs/event-emitter` — the way `@nestjs-modules/mailer`'s
 * `MailerEventService` emits the mailer's. It is opt-in: with `EventEmitterModule.forRoot()` imported
 * by the application, every {@link AttachmentEvent} reaches the `@OnEvent` handlers there; without
 * it, nothing is emitted and nothing fails.
 *
 * ```ts
 * @Injectable()
 * export class ThumbnailListener {
 *   @OnEvent(AttachmentEvent.VARIANT_FAILED)
 *   onFailure({ entity, primaryKey, error }: VariantGenerationFailed) {}
 * }
 * ```
 *
 * A listener that throws is logged and does not fail the generation it was told about.
 */
@Injectable()
export class AttachmentEventService {
  private readonly logger = new Logger(AttachmentEventService.name);

  constructor(
    @Optional()
    @Inject(EventEmitter2)
    private readonly eventEmitter?: EventEmitter2,
  ) {}

  emit<E extends AttachmentEvent>(
    event: E,
    payload: AttachmentEventPayloads[E],
  ): void {
    if (!this.eventEmitter) {
      return;
    }
    try {
      this.eventEmitter.emit(event, payload);
    } catch (error) {
      this.logger.warn(
        `Failed to emit event ${event}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Whether the application has an event emitter to emit on. */
  isAvailable(): boolean {
    return this.eventEmitter !== undefined;
  }
}
