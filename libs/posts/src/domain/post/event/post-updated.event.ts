import { AutoMap } from '@automapper/classes';
import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import { POSTS_NAMESPACE } from './posts.namespace';
import type { AssignedTag } from './assigned-tag';

@EventType({ namespace: POSTS_NAMESPACE, tags: ['postId'] })
export class PostUpdatedEvent implements DomainEvent {
  @AutoMap()
  readonly postId: string;
  @AutoMap()
  readonly title: string;
  @AutoMap()
  readonly content: string;
  @AutoMap()
  readonly authorId: string;
  readonly authorName: string;
  readonly tags: readonly AssignedTag[];
  @AutoMap()
  readonly version: number;
  @AutoMap()
  readonly createdAt: Date;
  @AutoMap()
  readonly occurredAt: Date;

  constructor(
    postId: string,
    title: string,
    content: string,
    authorId: string,
    authorName: string,
    tags: readonly AssignedTag[],
    version: number,
    createdAt: Date,
    occurredAt: Date,
  ) {
    this.postId = postId;
    this.title = title;
    this.content = content;
    this.authorId = authorId;
    this.authorName = authorName;
    this.tags = tags;
    this.version = version;
    this.createdAt = createdAt;
    this.occurredAt = occurredAt;
  }
}
