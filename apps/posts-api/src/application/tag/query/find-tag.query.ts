import type { IQueryHandler } from '@nestjs/cqrs';
import type { Tag } from '@nestposts/posts/domain/tag/tag.entity';
import type { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { Query, QueryHandler } from '@nestjs/cqrs';
import { TagRepository } from '@nestposts/posts/domain/tag/tag.repository';

export namespace FindTagQuery {
  export class FindTag extends Query<Tag | null> {
    constructor(readonly tagId: TagId) {
      super();
    }
  }

  @QueryHandler(FindTag)
  export class Handler implements IQueryHandler<FindTag> {
    constructor(private readonly tags: TagRepository) {}

    execute(query: FindTag): Promise<Tag | null> {
      return this.tags.findById(query.tagId);
    }
  }
}
