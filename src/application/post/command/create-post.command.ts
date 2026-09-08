import { Command } from '@nestjs/cqrs';
import type { PostId } from '../../../domain/post/vo/post-id';

/**
 * Command: criar um Post. A classe `Command<TResult>` do @nestjs/cqrs carrega o tipo do resultado, e é
 * ela que faz `commandBus.execute(new CreatePostCommand(...))` devolver um `PostId` tipado.
 *
 * O id vem de fora (gerado por quem despacha), como no Axon: o command já aponta para a entidade que
 * vai existir, e o handler pode rejeitar um id repetido.
 */
export class CreatePostCommand extends Command<PostId> {
  constructor(
    readonly postId: PostId,
    readonly title: string,
    readonly content: string,
    readonly author: string,
  ) {
    super();
  }
}
