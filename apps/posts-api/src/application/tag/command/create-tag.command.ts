import type { AsyncContext, ICommandHandler } from '@nestjs/cqrs';
import type { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Command, CommandHandler, EventPublisher } from '@nestjs/cqrs';
import { TagAlreadyExistsException } from '@nestposts/posts/domain/tag/exception/tag-already-exists.exception';
import { Tag } from '@nestposts/posts/domain/tag/tag.entity';
import { TagRepository } from '@nestposts/posts/domain/tag/tag.repository';

export namespace CreateTagCommand {
  export class CreateTag extends Command<TagId> {
    constructor(
      readonly tagId: TagId,
      readonly name: string,
    ) {
      super();
    }
  }

  @CommandHandler(CreateTag, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<CreateTag> {
    constructor(
      private readonly tags: TagRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}
    async execute(command: CreateTag): Promise<TagId> {
      if (await this.tags.findById(command.tagId)) {
        throw new TagAlreadyExistsException(command.tagId);
      }
      const tag = this.publisher.mergeObjectContext(
        Tag.create(command.tagId, command.name, new Date()),
        this.request,
      );
      await this.tags.save(tag);
      tag.commit();
      return tag.id;
    }
  }
}
