import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

@EventType({ namespace: 'tags', tags: ['tagId'] })
export class TagCreatedEvent implements DomainEvent {
  constructor(
    readonly tagId: string,
    readonly name: string,
    readonly occurredAt: Date,
  ) {}
}
