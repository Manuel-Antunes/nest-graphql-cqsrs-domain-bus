import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

@EventType({ namespace: 'users', tags: ['userId'] })
export class UserRestoredEvent implements DomainEvent {
  constructor(
    readonly userId: string,
    readonly occurredAt: Date,
  ) {}
}
