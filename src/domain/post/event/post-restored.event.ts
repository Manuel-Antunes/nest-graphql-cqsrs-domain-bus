import type { DomainEvent } from '../../shared/domain-event';

export class PostRestoredEvent implements DomainEvent {
  constructor(
    readonly postId: string,
    readonly version: number,
    readonly occurredAt: Date,
  ) {}
}
