import type { IEventHandler } from '@nestjs/cqrs';
import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { EventsHandler } from '@nestjs/cqrs';
import { inRequestContext } from '@nestposts/database';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostRepository } from '@nestposts/posts/domain/post/post.repository';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { Tag } from '@nestposts/posts/domain/tag/tag.entity';
import { TagRepository } from '@nestposts/posts/domain/tag/tag.repository';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { isIngested } from '@nestposts/transport-eventbus';

@Injectable()
@EventsHandler(PostCreatedEvent)
export class ProjectPostCompletion implements IEventHandler<PostCreatedEvent> {
  private readonly logger = new Logger(ProjectPostCompletion.name);

  constructor(
    private readonly posts: PostRepository,
    private readonly tags: TagRepository,
    private readonly em: EntityManager,
  ) {}

  async handle(event: PostCreatedEvent): Promise<void> {
    if (!isIngested(event)) {
      return;
    }
    await inRequestContext(this.em, async () => {
      const postId = PostId.parse(event.postId);
      const post = await this.posts.findById(postId);
      if (!post) {
        this.logger.warn(
          `post ${event.postId} was completed elsewhere and this service has no row for it — ` +
            `nothing to project`,
        );
        return;
      }
      if (post.isComplete()) {
        return;
      }
      await this.ensureTagsExist(event);
      post.loadFromHistory([event]);
      await this.posts.save(post);
      this.logger.debug(
        `post ${event.postId} projected as complete at version ${event.version}`,
      );
    });
  }

  private async ensureTagsExist(event: PostCreatedEvent): Promise<void> {
    for (const assigned of event.tags) {
      const tagId = TagId.parse(assigned.tagId);
      if (await this.tags.findById(tagId)) {
        continue;
      }
      const tag = Tag.create(tagId, assigned.name, event.occurredAt);
      tag.uncommit();
      await this.tags.save(tag);
      this.logger.log(
        `tag ${assigned.name} (${assigned.tagId}) recorded from the decision that came in`,
      );
    }
  }
}
