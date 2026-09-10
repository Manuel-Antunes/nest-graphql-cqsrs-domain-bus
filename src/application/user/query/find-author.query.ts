import { type IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';
import type { Author } from '../../../domain/user/author.entity';
import { UserRepository } from '../../../domain/user/user.repository';
import type { UserId } from '../../../domain/user/vo/user-id';

/**
 * A fatia de `FindAuthor`: a mensagem e o handler que servem o campo `Post.author`.
 *
 * ## Por que ela devolve `Author` e não `User`
 * O tipo do schema é `Author!`, e quem o garante é a chave estrangeira: `posts.author_id` aponta para
 * `authors`, então nenhuma linha de post referencia um leitor. Esta query existe para que essa garantia
 * chegue **tipada** à borda — o resolver não precisa de cast, e se um dia a FK mudasse, o `null` daqui é
 * que passaria a acontecer, num lugar só.
 */
export namespace FindAuthorQuery {
  /** Query: o autor de um post, pelo id. `null` se ele não for (mais) um autor ativo. */
  export class FindAuthor extends Query<Author | null> {
    constructor(readonly authorId: UserId) {
      super();
    }
  }

  /**
   * Handler de `FindAuthor`.
   *
   * ## As duas razões de ele custar zero consulta no caminho normal
   * A primeira é o identity map: quem chega aqui vindo de `post`/`posts`/de uma mutation tem o autor
   * **já carregado**, porque o repositório o popula junto do post (`populate: ['tags', 'author']`). Um
   * `findById` por chave primária nessa situação é servido de memória — há um teste que conta as
   * queries e prende isso.
   *
   * A segunda é que o `findById` é por id, e não por critério: mesmo sem identity map seria uma leitura
   * por chave primária, que é a consulta mais barata que existe. Quem paga de verdade é a subscription,
   * cuja view nasce do evento e portanto não tem autor carregado — uma consulta por payload entregue.
   *
   * ## O recorte
   * `canWritePosts()` é `this is Author`, então o `?:` abaixo estreita o tipo sem cast. Um `Reader`
   * devolve `null` pelo mesmo caminho de um id inexistente, e é deliberado: distinguir os dois daria a
   * quem perguntasse um oráculo de quais ids existem — o defeito que o `NotAnAuthorException` sem id
   * descreve.
   */
  @QueryHandler(FindAuthor)
  export class Handler implements IQueryHandler<FindAuthor> {
    constructor(private readonly users: UserRepository) {}

    async execute(query: FindAuthor): Promise<Author | null> {
      const user = await this.users.findById(query.authorId);
      return user?.canWritePosts() ? user : null;
    }
  }
}
