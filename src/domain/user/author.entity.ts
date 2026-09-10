import { Collection } from '@mikro-orm/core';
import type { Post } from '../post/post.entity';
import { User } from './user.entity';

/** Uma página dos posts de um autor: quantos, e a partir de onde. */
export interface AuthorPostsPage {
  readonly limit: number;
  readonly offset?: number;
}

/**
 * Um User que **escreve**. Tudo o que um `Reader` faz, mais ser autor de posts.
 *
 * ## A posse dos posts, e o cuidado que ela pede
 * `posts` é o lado inverso do `Post.author`: a coluna continua sendo `posts.author_id`, e o autor não
 * grava nada por aqui. A coleção existe para **perguntar**, não para carregar.
 *
 * A versão Java desta aplicação deliberadamente **não** tem esta coleção, e o javadoc do `Author` de
 * lá diz por quê: "um autor produtivo tem milhares de posts, e uma coleção mapeada é um convite a
 * carregar todos para responder qualquer coisa". O convite é real, e a resposta aqui não é abrir mão
 * da coleção — é não expor o que aceita o convite. Não há `loadItems()` nesta classe, e os dois
 * métodos abaixo vão ao banco com `limit`/`count`:
 *
 * - {@link posted} pagina pelo `matching()` da própria coleção — uma consulta com `limit`, e a
 *   coleção continua **não inicializada** depois;
 * - {@link postCount} é um `count(*)`, não um `length` de lista carregada.
 *
 * É a mesma escolha do `Post.tags` pelo motivo oposto: lá a coleção é pequena e limitada, então mora
 * no agregado inteira; aqui é aberta, então mora numa consulta — só que com a consulta expressa como
 * um método do agregado, e não espalhada em quem chama.
 */
export class Author extends User {
  /**
   * Os posts deste autor — lado inverso, e **preguiçoso por contrato**.
   *
   * Ela é `readonly` e nenhum método daqui a inicializa: quem quiser a lista inteira precisa dizer
   * isso explicitamente, de fora, e assumir o custo.
   */
  readonly posts = new Collection<Post, Author>(this);

  /** É o tipo que responde "pode escrever posts?" — e aqui a resposta é sim. */
  override canWritePosts(): this is Author {
    return true;
  }

  /**
   * Uma página dos posts deste autor, do mais recente para o mais antigo.
   *
   * Vai ao banco com `limit`: a coleção **não** é inicializada, e chamar isto num autor com dez mil
   * posts custa a página, não os dez mil.
   */
  posted(page: AuthorPostsPage): Promise<Post[]> {
    return this.posts.matching({
      limit: page.limit,
      offset: page.offset ?? 0,
      orderBy: { createdAt: 'desc', id: 'desc' },
    });
  }

  /** Quantos posts este autor escreveu. Um `count(*)`, não o tamanho de uma lista carregada. */
  postCount(): Promise<number> {
    return this.posts.loadCount();
  }

  /**
   * Este post é deste autor? Compara por **identidade**, então funciona igual com o `Post` vindo do
   * banco e com o que um replay montou — e sem tocar a coleção.
   */
  wrote(post: Post): boolean {
    return post.author.id.equals(this.id);
  }
}
