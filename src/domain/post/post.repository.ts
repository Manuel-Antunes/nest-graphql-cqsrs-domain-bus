import type { Cursor } from '@mikro-orm/core';
import type { Post } from './post.entity';
import type { PostId } from './vo/post-id';

/** Uma página pedida no estilo Relay: `first` itens depois do cursor `after` (ausente = do começo). */
export interface PostPage {
  readonly first: number;
  readonly after?: string | null;
}

/**
 * Porta do repositório de Posts. Guarda e devolve o próprio `Post` — a entidade de domínio é o que
 * está gravado; não existe DTO de leitura intermediário.
 *
 * Classe abstrata, e não `interface`, porque no Nest ela é ao mesmo tempo o contrato e o **token de
 * injeção**: `{ provide: PostRepository, useClass: MikroOrmPostRepository }` — sem `@Inject('TOKEN')`
 * nem símbolo à parte. É a forma nativa de declarar uma porta que a infraestrutura implementa.
 *
 * `findAll` devolve o `Cursor` do MikroORM: a paginação por cursor é do ORM (`em.findByCursor`), e
 * o objeto já traz itens, `hasNextPage` e os cursores codificados — exatamente o que uma Relay
 * connection precisa. Como o domínio já é mapeado pelo MikroORM, expor o `Cursor` na porta não
 * adiciona nenhuma dependência que ele não tivesse.
 */
export abstract class PostRepository {
  abstract save(post: Post): Promise<void>;
  abstract findById(postId: PostId): Promise<Post | null>;
  /** Posts em ordem de criação (`createdAt, id` — `createdAt` sozinho não é único). */
  abstract findAll(page: PostPage): Promise<Cursor<Post>>;
}
