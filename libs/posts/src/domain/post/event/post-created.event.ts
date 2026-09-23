import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { AutoMap } from '@automapper/classes';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import type { AssignedTag } from './assigned-tag';
import { POSTS_NAMESPACE } from './posts.namespace';

@EventType({ namespace: POSTS_NAMESPACE, version: '2.0.0', tags: ['postId'] })
export class PostCreatedEvent implements DomainEvent {
  @AutoMap()
  readonly postId: string;
  @AutoMap()
  readonly title: string;
  @AutoMap()
  readonly content: string;
  @AutoMap()
  readonly authorId: string;
  readonly tags: readonly AssignedTag[];
  @AutoMap()
  readonly version: number;
  @AutoMap()
  readonly occurredAt: Date;

  constructor(
    postId: string,
    title: string,
    content: string,
    authorId: string,
    tags: readonly AssignedTag[],
    version: number,
    occurredAt: Date,
  ) {
    this.postId = postId;
    this.title = title;
    this.content = content;
    this.authorId = authorId;
    this.tags = tags;
    this.version = version;
    this.occurredAt = occurredAt;
  }
}
