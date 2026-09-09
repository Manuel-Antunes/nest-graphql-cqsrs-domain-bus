import { EntityManager } from '@mikro-orm/core';
import { CreateRequestContext } from '@mikro-orm/decorators/legacy';
import { CommandHandler, EventPublisher, type ICommandHandler } from '@nestjs/cqrs';
import { PostNotFoundException } from '../../../domain/post/exception/post-not-found.exception';
import { PostRepository } from '../../../domain/post/post.repository';
import { UpdatePostCommand } from './update-post.command';

/**
 * Handler de `UpdatePostCommand`: carrega o Post, pede a ele que decida o update, salva, publica.
 * O domínio é quem rejeita "sem mudanças" e valores inválidos; o handler só orquestra.
 */
@CommandHandler(UpdatePostCommand)
export class UpdatePostCommandHandler implements ICommandHandler<UpdatePostCommand> {
  constructor(
    private readonly em: EntityManager,
    private readonly posts: PostRepository,
    private readonly publisher: EventPublisher,
  ) {}

  @CreateRequestContext()
  async execute(command: UpdatePostCommand): Promise<void> {
    const post = await this.posts.findById(command.postId);
    if (!post) {
      throw new PostNotFoundException(command.postId);
    }
    this.publisher.mergeObjectContext(post).update({ title: command.title, content: command.content }, new Date());
    await this.posts.save(post);
    post.commit();
  }
}
