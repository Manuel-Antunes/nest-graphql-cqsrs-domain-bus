import { AutoMap } from '@automapper/classes';
import type { DomainEvent } from '../../shared/domain-event';

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
  readonly tags: readonly PostUpdatedEventTag[];
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
    tags: readonly PostUpdatedEventTag[],
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

export interface PostUpdatedEventTag {
  readonly tagId: string;
  readonly name: string;
}
