import type { DomainEvent } from '../../shared/domain-event';

export class UserDeletedEvent implements DomainEvent {
  constructor(
    readonly userId: string,
    readonly occurredAt: Date,
  ) {}
}
