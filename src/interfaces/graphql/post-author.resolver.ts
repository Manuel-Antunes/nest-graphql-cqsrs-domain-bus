import { QueryBus } from '@nestjs/cqrs';
import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { FindAuthorQuery } from '../../application/user/query/find-author.query';
import { NotAnAuthorException } from '../../domain/user/exception/not-an-author.exception';
import type { AuthorView } from '../../dto/graphql/user.view';
import type { PostView } from '../../dto/graphql/post.view';
import { UserViewMapper } from '../mapper/user-view.mapper';

/**
 * O campo `Post.author`: o `authorId` da view trocado pelo `Author` do protocolo.
 *
 * Ele é o que transformou `Post` e `Author` num **grafo** em vez de duas listas: de um post navega-se
 * para quem o escreveu, e de lá para os outros posts dele. Antes daqui, `author` era um `String!` — o
 * nome copiado para a view —, e navegar não era possível porque não havia identidade do outro lado.
 *
 * ## O que ele custa: nada, no caminho que importa
 * Numa leitura (`post`, `posts`, o retorno de uma mutation) o repositório popula o autor junto do post,
 * então ele está no identity map do EntityManager daquela requisição e o `findById` do handler é
 * servido de memória — **zero consultas**, e há um teste que as conta para que isto não deixe de ser
 * verdade em silêncio.
 *
 * Numa **subscription** é uma consulta por payload: a view nasce do evento, sem tocar o banco, e o
 * evento carrega `authorId` e `authorName` mas não e-mail — e-mail não é fato sobre um post. Quem pede
 * `author` ali está pedindo algo que não está no evento, e paga por isso.
 *
 * ## O N+1 que isto abriu, e que ainda não está fechado
 * `posts(first: 20) { author { … } }` é grátis pelo populate. `posts(first: 20) { author { posts … } }`
 * **não é**: cada `Author.posts` é a sua própria consulta paginada, então são 20. É o mesmo N+1 que a
 * versão Axon resolve com um DataLoader em `Author.posts`, e aqui ele passou a existir exatamente agora
 * — antes deste campo não havia caminho do protocolo que chegasse a N autores. A saída nativa é o
 * `dataloader: DataloaderType.ALL` (já ligado no config) aplicado a um acesso por relação em vez de uma
 * consulta por autor; fica anotado, e a fronteira destas classes não muda.
 */
@Resolver('Post')
export class PostAuthorResolver {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly viewMapper: UserViewMapper,
  ) {}

  /**
   * @throws NotAnAuthorException se o autor não for mais um autor ativo — o que só acontece se ele
   * tiver sido apagado entre o evento e a resolução. Nas leituras a janela não existe: o filtro
   * `active` se aplica à relação (`autoJoinRefsForFilters`), então um post de autor apagado não volta
   * da consulta para começo de conversa.
   */
  @ResolveField('author')
  async author(@Parent() post: PostView): Promise<AuthorView> {
    const author = await this.queryBus.execute(new FindAuthorQuery.FindAuthor(post.authorId));
    if (!author) {
      throw new NotAnAuthorException(post.authorId);
    }
    return this.viewMapper.fromAuthor(author);
  }
}
