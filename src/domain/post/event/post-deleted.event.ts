import type { DomainEvent } from '../../shared/domain-event';

export class PostDeletedEvent implements DomainEvent {
  constructor(
    readonly postId: string,
    readonly version: number,
    readonly occurredAt: Date,
  ) {}
}
