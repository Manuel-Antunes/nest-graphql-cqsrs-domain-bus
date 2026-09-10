import { type Cursor, EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { Post } from '../../../../domain/post/post.entity';
import { type PostPage, PostRepository } from '../../../../domain/post/post.repository';
import type { PostId } from '../../../../domain/post/vo/post-id';
import type { UserId } from '../../../../domain/user/vo/user-id';
import { inRequestContext } from '../../request-context';
import { ACTIVE_FILTER } from '../entities/soft-delete-orm.entity';

/**
 * Adapter da porta `PostRepository` sobre o MikroORM. Três métodos, nenhuma regra de negócio.
 *
 * O `EntityManager` injetado é o global: cada método dele delega para o contexto atual — o fork da
 * request HTTP, aberto pelo middleware na borda. É isso que faz o
 * `flush` de `save` gravar exatamente o que **aquele** command mudou, e nada mais.
 */
@Injectable()
export class MikroOrmPostRepository extends PostRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async save(post: Post): Promise<void> {
    await this.em.persist(post).flush();
  }

  /**
   * `populate: ['tags', 'author']` porque as duas são relações. Sem `tags`, a coleção volta vazia e
   * não carregada; sem `author`, a `Ref<Author>` volta não inicializada e qualquer decisão estoura
   * (`Reference<Author> … not initialized`) — o evento precisa do nome do autor, e o nome está no
   * agregado `User`. É o preço da referência sobre a cópia, cobrado no lugar certo: a borda da
   * persistência, não o domínio.
   *
   * Desde que `Post.author` virou um `type Author`, o `populate: ['author']` paga por uma segunda coisa
   * — e esta é de leitura, não de escrita: o autor fica no identity map daquela requisição, e resolver
   * o campo `Post.author` passa a custar **zero consultas**. Ver `FindAuthorQuery.Handler`, onde há um
   * teste que as conta.
   */
  findById(postId: PostId): Promise<Post | null> {
    return this.em.findOne(Post, { id: postId }, { populate: ['tags', 'author'] });
  }

  /**
   * Paginação por cursor nativa do ORM: `first`/`after` viram um `WHERE (created_at, id) > (?, ?)` +
   * `LIMIT first + 1`, e o `Cursor` devolvido já sabe se há próxima página e qual é o `endCursor`.
   * A ordenação é `createdAt, id` — `createdAt` sozinho não é único.
   */
  /**
   * A escrita que passa por fora do filtro: `nativeUpdate` com `active: false`, sem identity map no
   * meio. É o equivalente do update nativo que a versão Java usa para escapar do `@SQLRestriction`.
   */
  async restore(postId: PostId): Promise<void> {
    await this.em.nativeUpdate(
      Post,
      { id: postId },
      { deleted: { deletedAt: null } },
      { filters: { [ACTIVE_FILTER]: false } },
    );
  }

  findAll(page: PostPage): Promise<Cursor<Post>> {
    return this.em.findByCursor(Post, {
      first: page.first,
      after: page.after ?? undefined,
      orderBy: { createdAt: 'asc', id: 'asc' },
      populate: ['tags', 'author'],
    });
  }

  /**
   * O mesmo `findByCursor` de `findAll`, com duas diferenças — e nenhuma delas é acidental.
   *
   * O **recorte** é `{ author: authorId }`: um value object na condição, que o `valueObjectType`
   * aceita tal como aceita o texto. Como a coluna `posts.author_id` aponta para `authors`, o id de um
   * Reader simplesmente não acha nada — não há caminho por onde um leitor apareça com posts.
   *
   * A **ordem** é decrescente (`createdAt, id`) — o contrário de `findAll`. Como as duas usam as mesmas
   * chaves de ordenação, um cursor de uma connection **decodifica** na outra e não é recusado: ele
   * passa a significar o lado oposto da comparação, e a página que sai é outra (normalmente vazia).
   * Não é um problema a resolver aqui — um cursor é opaco por contrato, e o cliente que o tira de uma
   * lista o devolve na mesma —, mas é a razão de não haver atalho entre as duas: elas são listas
   * diferentes, e não duas vistas da mesma.
   */
  findByAuthor(authorId: UserId, page: PostPage): Promise<Cursor<Post>> {
    // O {@link inRequestContext} é pela mesma razão de `MikroOrmUserRepository.findById`: desde que
    // `Post.author` é um `Author`, uma subscription consegue pedir
    // `onPostCreated { author { posts { … } } }` — e ali não há requisição HTTP por baixo. Numa leitura
    // normal o envelope é inerte, porque já existe contexto.
    return inRequestContext(this.em, () =>
      this.em.findByCursor(Post, {
        where: { author: authorId },
        first: page.first,
        after: page.after ?? undefined,
        orderBy: { createdAt: 'desc', id: 'desc' },
        populate: ['tags', 'author'],
      }),
    );
  }
}
