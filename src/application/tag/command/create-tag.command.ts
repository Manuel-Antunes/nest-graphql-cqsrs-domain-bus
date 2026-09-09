import { EntityManager } from '@mikro-orm/core';
import { CreateRequestContext } from '@mikro-orm/decorators/legacy';
import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { type AsyncContext, Command, CommandHandler, EventPublisher, type ICommandHandler } from '@nestjs/cqrs';
import { TagAlreadyExistsException } from '../../../domain/tag/exception/tag-already-exists.exception';
import { Tag } from '../../../domain/tag/tag.entity';
import { TagRepository } from '../../../domain/tag/tag.repository';
import type { TagId } from '../../../domain/tag/vo/tag-id';

/** A fatia de `CreateTag`: a mensagem e o handler dela — ver `CreatePostCommand` para o padrão. */
export namespace CreateTagCommand {
  /** Command: criar uma Tag. Como no Post, o id vem de quem despacha. */
  export class CreateTag extends Command<TagId> {
    constructor(
      readonly tagId: TagId,
      readonly name: string,
    ) {
      super();
    }
  }

  /**
   * Handler de `CreateTag`: rejeita id repetido, cria pela entidade, salva, publica.
   *
   * Request-scoped, e é aqui que a propagação mostra que atravessa **agregado**: a tag padrão nasce
   * dentro da request de um post — a saga despacha este command passando adiante o contexto do
   * `PostCreatedEvent` —, então o `TagCreatedEvent` sai carimbado com a mesma `PostRequest` que o
   * `PostCreatedEvent` e o `PostUpdatedEvent` daquela cadeia. Uma request, um `PostId`, três eventos.
   */
  @CommandHandler(CreateTag, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<CreateTag> {
    constructor(
      private readonly em: EntityManager,
      private readonly tags: TagRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}

    @CreateRequestContext()
    async execute(command: CreateTag): Promise<TagId> {
      if (await this.tags.findById(command.tagId)) {
        throw new TagAlreadyExistsException(command.tagId);
      }
      const tag = this.publisher.mergeObjectContext(Tag.create(command.tagId, command.name, new Date()), this.request);
      await this.tags.save(tag);
      tag.commit();
      return tag.id;
    }
  }
}
