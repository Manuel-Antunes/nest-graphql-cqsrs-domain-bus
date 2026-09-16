import type { DomainEvent } from '../../shared/domain-event';

export class UserRegisteredEvent implements DomainEvent {
  constructor(
    readonly userId: string,
    readonly email: string,
    readonly name: string,
    readonly role: string | null,
    readonly supersedes: string | null,
    readonly occurredAt: Date,
  ) {}
}
