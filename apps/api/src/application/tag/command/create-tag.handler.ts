import { EntityManager } from '@mikro-orm/core';
import { CreateRequestContext } from '@mikro-orm/decorators/legacy';
import { CommandHandler, EventPublisher, type ICommandHandler } from '@nestjs/cqrs';
import { TagAlreadyExistsException } from '../../../domain/tag/exception/tag-already-exists.exception';
import { Tag } from '../../../domain/tag/tag.entity';
import { TagRepository } from '../../../domain/tag/tag.repository';
import type { TagId } from '../../../domain/tag/vo/tag-id';
import { CreateTagCommand } from './create-tag.command';

/** Handler de `CreateTagCommand`: rejeita id repetido, cria pela entidade, salva, publica. */
@CommandHandler(CreateTagCommand)
export class CreateTagCommandHandler implements ICommandHandler<CreateTagCommand> {
  constructor(
    private readonly em: EntityManager,
    private readonly tags: TagRepository,
    private readonly publisher: EventPublisher,
  ) {}

  @CreateRequestContext()
  async execute(command: CreateTagCommand): Promise<TagId> {
    if (await this.tags.findById(command.tagId)) {
      throw new TagAlreadyExistsException(command.tagId);
    }
    const tag = this.publisher.mergeObjectContext(Tag.create(command.tagId, command.name, new Date()));
    await this.tags.save(tag);
    tag.commit();
    return tag.id;
  }
}
