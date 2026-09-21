import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

@EventType({ namespace: 'users', tags: ['userId'] })
export class UserRoleGrantedEvent implements DomainEvent {
  constructor(
    readonly userId: string,
    readonly role: string,
    readonly occurredAt: Date,
  ) {}
}
