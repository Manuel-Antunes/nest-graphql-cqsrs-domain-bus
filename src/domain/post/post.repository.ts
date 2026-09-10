import type { Cursor } from '@mikro-orm/core';
import type { UserId } from '../user/vo/user-id';
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

  /**
   * Os posts de um autor, **do mais recente para o mais antigo** — o campo `Author.posts` do schema.
   *
   * ## Por que aqui, e não em `Author.posted`
   * O agregado tem o seu próprio paginador (ver `Author.posted`), e ele continua sendo a resposta
   * quando a pergunta é de domínio: "quantos posts este autor tem", "ele escreveu este post". O que
   * ele não faz — e não deve fazer — é dizer com que relações um Post precisa voltar para ser
   * **lido**: `populate` é preço da referência sobre a cópia, e esse preço é cobrado na borda da
   * persistência, não no domínio. Ver `MikroOrmPostRepository.findById`.
   *
   * Daí este método existir ao lado de `findAll`, e não em vez de: os dois devolvem o mesmo `Cursor`,
   * com os mesmos cursores opacos e a mesma mecânica de `hasNextPage`, e a única diferença entre eles
   * é o recorte e a ordem. Uma connection paginada por keyset num lugar e por offset no outro seria
   * duas paginações para o cliente aprender.
   */
  abstract findByAuthor(authorId: UserId, page: PostPage): Promise<Cursor<Post>>;

  /**
   * Torna a linha de um post apagado **visível** de novo.
   *
   * O filtro `active` recorta toda consulta, então enquanto a linha estiver marcada nem o `findById`
   * a acha — e restaurar precisa de uma escrita que passe por fora do filtro. Quem chama faz o par:
   * primeiro este método, para a linha reaparecer, depois o `findById` + o `restore` do agregado, que
   * é quem registra o fato.
   */
  abstract restore(postId: PostId): Promise<void>;
}
