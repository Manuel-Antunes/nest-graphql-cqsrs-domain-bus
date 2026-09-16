import type { DomainEvent } from '../../shared/domain-event';

export class UserSupersededEvent implements DomainEvent {
  constructor(
    readonly userId: string,
    readonly supersededBy: string,
    readonly occurredAt: Date,
  ) {}
}
