import type { IEvent } from '@nestjs/cqrs';

export interface DomainEvent extends IEvent {
  readonly occurredAt: Date;
}
