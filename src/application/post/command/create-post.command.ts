import { EntityManager, ref, rel } from '@mikro-orm/core';
import { Inject, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { type AsyncContext, Command, CommandHandler, EventPublisher, type ICommandHandler } from '@nestjs/cqrs';
import { PostAlreadyExistsException } from '../../../domain/post/exception/post-already-exists.exception';
import { Post } from '../../../domain/post/post.entity';
import { PostRepository } from '../../../domain/post/post.repository';
import type { PostId } from '../../../domain/post/vo/post-id';
import { Author } from '../../../domain/user/author.entity';
import type { UserId } from '../../../domain/user/vo/user-id';
import type { UserName } from '../../../domain/user/vo/user-name';

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
   *
   * O autor **não** vem do corpo da requisição: vem da sessão, e o resolver o tira de lá — já como
   * `Author`, porque é lá que a guarda de papel roda. O command carrega o **retrato** dele: o id, que
   * vira a referência, e o nome, que é o que o `PostCreatedEvent` registra. Carregar o agregado não é
   * preciso, e a chave estrangeira garante melhor do que a consulta garantia — ver `Post.create`.
   */
  export class CreatePost extends Command<PostId> {
    constructor(
      readonly postId: PostId,
      readonly title: string,
      readonly content: string,
      readonly authorId: UserId,
      readonly authorName: UserName,
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
   * ## O contexto do ORM vem da borda
   * Este handler **não** abre uma unidade de trabalho própria. O contexto é o da requisição, aberto
   * pelo middleware que o `MikroOrmModule.forRoot` registra, e é o mesmo do resolver, dos outros
   * commands da mesma requisição e da saga que os eventos dela acordam — um identity map por
   * requisição, e não um por mensagem. É **metade** do `ProcessingContext` do Axon — a transacional.
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
    async execute(command: CreatePost): Promise<PostId> {
      if (await this.posts.findById(command.postId)) {
        throw new PostAlreadyExistsException(command.postId);
      }
      // Nenhuma leitura do agregado `User`: o autor já veio decidido da borda, e o que falta é só a
      // referência que a coluna `author_id` guarda. Se o id não existir ou não for de um autor, quem
      // recusa é a chave estrangeira — e o `MikroOrmExceptionFilter` a traduz na borda.
      const author = ref(rel(Author, command.authorId));
      const post = this.publisher.mergeObjectContext(
        Post.create(
          command.postId,
          { title: command.title, content: command.content },
          author,
          command.authorName,
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
