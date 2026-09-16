import type { DomainEvent } from '../../shared/domain-event';

export class TagCreatedEvent implements DomainEvent {
  constructor(
    readonly tagId: string,
    readonly name: string,
    readonly occurredAt: Date,
  ) {}
}
