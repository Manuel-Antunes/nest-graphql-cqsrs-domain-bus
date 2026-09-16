import { AutoMap } from '@automapper/classes';
import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { type AsyncContext, Command, CommandHandler, EventPublisher, type ICommandHandler } from '@nestjs/cqrs';
import { PostNotFoundException } from '../../../domain/post/exception/post-not-found.exception';
import { PostRepository } from '../../../domain/post/post.repository';
import { PostId } from '../../../domain/post/vo/post-id';

/** A fatia de `UpdatePost`: a mensagem e o handler dela — ver `CreatePostCommand` para o padrão. */
export namespace UpdatePostCommand {
  /**
   * Command: atualizar título e/ou conteúdo de um Post. Campos `null`/ausentes significam "manter o
   * valor atual" — quem sabe qual é o valor atual é a entidade, então o command só carrega a intenção.
   */
  export class UpdatePost extends Command<void> {
    @AutoMap(() => PostId)
    readonly postId: PostId;
    // Tipo explícito: o TypeScript emite `design:type` `Object` para uma união, e o `@AutoMap()`
    // descarta `Object` — o campo sairia do mapeamento em silêncio.
    @AutoMap(() => String)
    readonly title?: string | null;
    @AutoMap(() => String)
    readonly content?: string | null;

    constructor(postId: PostId, title?: string | null, content?: string | null) {
      super();
      this.postId = postId;
      this.title = title;
      this.content = content;
    }
  }

  /**
   * Handler de `UpdatePost`: carrega o Post, pede a ele que decida o update, salva, publica.
   * O domínio é quem rejeita "sem mudanças" e valores inválidos; o handler só orquestra.
   *
   * Request-scoped como os outros command handlers, e pelo mesmo motivo: o `PostUpdatedEvent` que sai
   * daqui sai carimbado com a request que o pediu — ver `CreatePostCommand.Handler` e `PostRequest`.
   */
  @CommandHandler(UpdatePost, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<UpdatePost> {
    constructor(
      private readonly posts: PostRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}
    async execute(command: UpdatePost): Promise<void> {
      const post = await this.posts.findById(command.postId);
      if (!post) {
        throw new PostNotFoundException(command.postId);
      }
      this.publisher
        .mergeObjectContext(post, this.request)
        .update({ title: command.title, content: command.content }, new Date());
      await this.posts.save(post);
      post.commit();
    }
  }
}
