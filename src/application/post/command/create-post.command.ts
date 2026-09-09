import { EntityManager } from '@mikro-orm/core';
import { CreateRequestContext } from '@mikro-orm/decorators/legacy';
import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { type AsyncContext, Command, CommandHandler, EventPublisher, type ICommandHandler } from '@nestjs/cqrs';
import { PostAlreadyExistsException } from '../../../domain/post/exception/post-already-exists.exception';
import { Post } from '../../../domain/post/post.entity';
import { PostRepository } from '../../../domain/post/post.repository';
import type { PostId } from '../../../domain/post/vo/post-id';

/**
 * A fatia de `CreatePost`: a **mensagem** e o **handler** dela, num arquivo só, sob um namespace.
 *
 * O par mensagem/handler é o que menos se separa nesta arquitetura — mudar o que um command carrega
 * é mudar quem o trata, sempre —, e o namespace diz isso no código: `CreatePostCommand.CreatePost` é
 * o que se despacha, `CreatePostCommand.Handler` é o que o `app.module` registra. Quem chega neste
 * caso de uso abre um arquivo, não dois.
 *
 * O namespace também é o que dá um nome curto ao handler sem perder o contexto: `Handler` diz tudo
 * quando o namespace já disse de quem. É o mesmo agrupamento do `Command`/`Handler` aninhados do
 * MediatR, com a ferramenta que o TypeScript tem para isso.
 */
export namespace CreatePostCommand {
  /**
   * Command: criar um Post. A classe `Command<TResult>` do @nestjs/cqrs carrega o tipo do resultado, e é
   * ela que faz `commandBus.execute(new CreatePostCommand.CreatePost(...))` devolver um `PostId` tipado.
   *
   * O id vem de fora (gerado por quem despacha), como no Axon: o command já aponta para a entidade que
   * vai existir, o handler pode rejeitar um id repetido, e é esse id que vira a chave da `PostRequest`.
   */
  export class CreatePost extends Command<PostId> {
    constructor(
      readonly postId: PostId,
      readonly title: string,
      readonly content: string,
      readonly author: string,
    ) {
      super();
    }
  }

  /**
   * Handler de **um** command: `CreatePost`. Tudo o que acontece quando esse command chega está aqui.
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
   * identity map. É **metade** do `ProcessingContext` por command do Axon — a transacional —, dita com
   * a ferramenta do ORM.
   *
   * ## `{ scope: Scope.REQUEST }` e `@Inject(REQUEST)`
   * A outra metade, e a que o ORM não dá: a **identidade** do pedido. O `@CommandHandler` repassa suas
   * opções ao `@Injectable`, então este handler é resolvido de novo a cada command — no `ContextId` da
   * `PostRequest` que o resolver criou. É por isso que `@Inject(REQUEST)` entrega aqui o mesmo objeto
   * que o `PostMutationResolver` passou como segundo argumento do `commandBus.execute`.
   *
   * ## `EventPublisher.mergeObjectContext`
   * É o que liga `post.commit()` ao `EventBus`: o aggregate root do @nestjs/cqrs não conhece o bus; o
   * publisher injeta `publish`/`publishAll` na instância. O **segundo argumento** é a propagação: com
   * ele, o `EventBus` carimba a request em cada evento que sair daqui, e quem ouvir (a saga) descobre
   * de qual pedido aquele fato veio. O domínio dispara, a aplicação decide quando — e agora também
   * *em nome de quem*.
   */
  @CommandHandler(CreatePost, { scope: Scope.REQUEST })
  export class Handler implements ICommandHandler<CreatePost> {
    constructor(
      private readonly em: EntityManager,
      private readonly posts: PostRepository,
      private readonly publisher: EventPublisher,
      /**
       * A request desta execução. Tipada pela base `AsyncContext` de propósito: um command handler
       * **propaga** o contexto, não o interpreta — quem lê o `postId` dele é a saga. E um command
       * despachado sem request (um teste, um `commandBus.execute` de uma linha) chega com o contexto
       * anônimo que o próprio `CommandBus` cria.
       */
      @Inject(REQUEST) private readonly request: AsyncContext,
    ) {}

    @CreateRequestContext()
    async execute(command: CreatePost): Promise<PostId> {
      if (await this.posts.findById(command.postId)) {
        throw new PostAlreadyExistsException(command.postId);
      }
      const post = this.publisher.mergeObjectContext(
        Post.create(
          command.postId,
          { title: command.title, content: command.content, author: command.author },
          new Date(),
        ),
        this.request,
      );
      await this.posts.save(post);
      post.commit();
      return post.id;
    }
  }
}
