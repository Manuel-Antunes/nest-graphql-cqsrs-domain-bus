import { AutoMap } from '@automapper/classes';
import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { POSTS_NAMESPACE } from './posts.namespace';

@EventType({ namespace: POSTS_NAMESPACE, tags: ['postId'] })
export class PostPreCreatedEvent implements DomainEvent {
  @AutoMap()
  readonly postId: string;
  @AutoMap()
  readonly title: string;
  @AutoMap()
  readonly content: string;
  @AutoMap()
  readonly authorId: string;
  readonly authorName: string;
  @AutoMap()
  readonly occurredAt: Date;

  constructor(
    postId: string,
    title: string,
    content: string,
    authorId: string,
    authorName: string,
    occurredAt: Date,
  ) {
    this.postId = postId;
    this.title = title;
    this.content = content;
    this.authorId = authorId;
    this.authorName = authorName;
    this.occurredAt = occurredAt;
  }
}
