import { EntityManager } from '@mikro-orm/core';
import { CreateRequestContext } from '@mikro-orm/decorators/legacy';
import { CommandHandler, EventPublisher, type ICommandHandler } from '@nestjs/cqrs';
import { PostAlreadyExistsException } from '../../../domain/post/exception/post-already-exists.exception';
import { Post } from '../../../domain/post/post.entity';
import { PostRepository } from '../../../domain/post/post.repository';
import type { PostId } from '../../../domain/post/vo/post-id';
import { CreatePostCommand } from './create-post.command';

/**
 * Handler de **um** command: `CreatePostCommand`. Uma classe por handler, colada ao command que ela
 * trata — tudo o que acontece quando esse command chega está neste arquivo.
 *
 * ## Criar, salvar, e só então publicar
 * 1. pede ao domínio que crie o Post (`Post.create` valida e `apply`-ca o `PostCreatedEvent`);
 * 2. **grava** o resultado — o `flush` do MikroORM é uma transação;
 * 3. `commit()` publica os eventos não-commitados no `EventBus`.
 *
 * A ordem importa: quem ouve o evento (saga da tag padrão, subscriptions) só é avisado depois que o
 * post está no banco. É o equivalente do "emit sai depois do commit" do Axon.
 *
 * ## `@CreateRequestContext()`
 * Cada command roda na **sua** unidade de trabalho: um fork do EntityManager só dele, criado pelo
 * decorator do MikroORM. Sem isso, um command despachado por uma saga herdaria (pelo AsyncLocalStorage)
 * o contexto da request HTTP que publicou o evento, e dois fluxos concorrentes dividiriam o mesmo
 * identity map. É o `ProcessingContext` por command do Axon, dito com a ferramenta do ORM.
 *
 * ## `EventPublisher.mergeObjectContext`
 * É o que liga `post.commit()` ao `EventBus`: o aggregate root do @nestjs/cqrs não conhece o bus; o
 * publisher injeta `publish`/`publishAll` na instância. O domínio dispara, a aplicação decide quando.
 */
@CommandHandler(CreatePostCommand)
export class CreatePostCommandHandler implements ICommandHandler<CreatePostCommand> {
  constructor(
    private readonly em: EntityManager,
    private readonly posts: PostRepository,
    private readonly publisher: EventPublisher,
  ) {}

  @CreateRequestContext()
  async execute(command: CreatePostCommand): Promise<PostId> {
    if (await this.posts.findById(command.postId)) {
      throw new PostAlreadyExistsException(command.postId);
    }
    const post = this.publisher.mergeObjectContext(
      Post.create(command.postId, { title: command.title, content: command.content, author: command.author }, new Date()),
    );
    await this.posts.save(post);
    post.commit();
    return post.id;
  }
}
