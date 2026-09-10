import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { type AsyncContext, Command, CommandHandler, EventPublisher, type ICommandHandler } from '@nestjs/cqrs';
import { PostNotFoundException } from '../../../domain/post/exception/post-not-found.exception';
import { PostRepository } from '../../../domain/post/post.repository';
import type { PostId } from '../../../domain/post/vo/post-id';
import { TagNotFoundException } from '../../../domain/tag/exception/tag-not-found.exception';
import { TagRepository } from '../../../domain/tag/tag.repository';
import type { TagId } from '../../../domain/tag/vo/tag-id';

/** A fatia de `AssignTagToPost`: a mensagem e o handler dela — ver `CreatePostCommand` para o padrão. */
export namespace AssignTagToPostCommand {
  /**
   * Command: assinalar uma Tag existente a um Post. Carrega os dois ids; o handler carrega a Tag para
   * copiar o nome dela para dentro do Post (`TagRef`), porque agregado referencia agregado por identidade.
   */
  export class AssignTagToPost extends Command<void> {
    constructor(
      readonly postId: PostId,
      readonly tagId: TagId,
    ) {
      super();
    }
  }

  /**
   * Handler de `AssignTagToPost`: carrega a Tag, pede ao Post que a assinale — o que dispara um
   * `PostUpdatedEvent` com a tag na lista — salva e publica.
   *
   * A Tag entra no domínio como **agregado**, não como cópia: `post.assignTag(tag, ...)` recebe a
   * entidade, a relação m:n a guarda, e é dela que sai o nome que viaja no evento. Por isso o Post
   * precisa vir com as tags populadas — `MikroOrmPostRepository.findById` cuida disso.
   *
   * Este é o handler que fecha o ciclo da propagação: quem despacha o command é a saga, não a borda, e
   * mesmo assim ele roda **na request que criou o post**. A saga carimba o command com o contexto que
   * veio no `PostCreatedEvent` (`request.attachTo(command)`), o `CommandBus` resolve este handler
   * naquele `ContextId`, e o `PostUpdatedEvent` que sai daqui sai com o mesmo carimbo — o cliente vê a
   * tag chegar pelo `onPostUpdated` como parte da mesma cadeia que a sua mutation abriu.
   */
  @CommandHandler(AssignTagToPost, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<AssignTagToPost> {
    constructor(
      private readonly posts: PostRepository,
      private readonly tags: TagRepository,
      private readonly publisher: EventPublisher,
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}
    async execute(command: AssignTagToPost): Promise<void> {
      const tag = await this.tags.findById(command.tagId);
      if (!tag) {
        throw new TagNotFoundException(command.tagId);
      }
      const post = await this.posts.findById(command.postId);
      if (!post) {
        throw new PostNotFoundException(command.postId);
      }
      this.publisher.mergeObjectContext(post, this.request).assignTag(tag, new Date());
      await this.posts.save(post);
      post.commit();
    }
  }
}
