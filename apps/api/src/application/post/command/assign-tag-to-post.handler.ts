import { EntityManager } from '@mikro-orm/core';
import { CreateRequestContext } from '@mikro-orm/decorators/legacy';
import { CommandHandler, EventPublisher, type ICommandHandler } from '@nestjs/cqrs';
import { PostNotFoundException } from '../../../domain/post/exception/post-not-found.exception';
import { PostRepository } from '../../../domain/post/post.repository';
import { TagNotFoundException } from '../../../domain/tag/exception/tag-not-found.exception';
import { TagRepository } from '../../../domain/tag/tag.repository';
import { AssignTagToPostCommand } from './assign-tag-to-post.command';

/**
 * Handler de `AssignTagToPostCommand`: lê a Tag (para copiar id + nome), pede ao Post que a assinale
 * — o que dispara um `PostUpdatedEvent` com a tag na lista — salva e publica.
 */
@CommandHandler(AssignTagToPostCommand)
export class AssignTagToPostCommandHandler implements ICommandHandler<AssignTagToPostCommand> {
  constructor(
    private readonly em: EntityManager,
    private readonly posts: PostRepository,
    private readonly tags: TagRepository,
    private readonly publisher: EventPublisher,
  ) {}

  @CreateRequestContext()
  async execute(command: AssignTagToPostCommand): Promise<void> {
    const tag = await this.tags.findById(command.tagId);
    if (!tag) {
      throw new TagNotFoundException(command.tagId);
    }
    const post = await this.posts.findById(command.postId);
    if (!post) {
      throw new PostNotFoundException(command.postId);
    }
    this.publisher.mergeObjectContext(post).assignTag({ tagId: tag.id, name: tag.name }, new Date());
    await this.posts.save(post);
    post.commit();
  }
}
