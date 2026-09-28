import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import type {
  BillingEvent,
  BillingEventPayloads,
} from '../../domain/billing/billing-event';

@Injectable()
export class BillingEventService {
  constructor(
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
  ) {}

  async emit<E extends BillingEvent>(
    event: E,
    payload: BillingEventPayloads[E],
  ): Promise<void> {
    await this.eventEmitter.emitAsync(event, payload);
  }
}
