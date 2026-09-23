import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { POSTS_NAMESPACE } from './posts.namespace';

@EventType({ namespace: POSTS_NAMESPACE, tags: ['postId'] })
export class PostRestoredEvent implements DomainEvent {
  constructor(
    readonly postId: string,
    readonly version: number,
    readonly occurredAt: Date,
  ) {}
}
