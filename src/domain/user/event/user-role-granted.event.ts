import type { DomainEvent } from '../../shared/domain-event';

export class UserRoleGrantedEvent implements DomainEvent {
  constructor(
    readonly userId: string,
    readonly role: string,
    readonly occurredAt: Date,
  ) {}
}
