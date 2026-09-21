import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

@EventType({ namespace: 'users', tags: ['userId'] })
export class UserRegisteredEvent implements DomainEvent {
  constructor(
    readonly userId: string,
    readonly email: string,
    readonly name: string,
    readonly roles: readonly string[],
    readonly occurredAt: Date,
  ) {}
}
