import { Injectable } from '@nestjs/common';
import type { Author } from '../../domain/user/author.entity';
import type { User } from '../../domain/user/user.entity';
import { AuthorView, ReaderView, type UserView } from '../../dto/graphql/user.view';

/**
 * Domínio → protocolo, para a hierarquia de usuário. O irmão do {@link PostViewMapper}, com uma
 * diferença de natureza: aqui o **destino depende do tipo**.
 *
 * ## Por que é um `if`, e não um mapeamento de campos
 * A mesma referência `User` vira `ReaderView` ou `AuthorView` conforme o que o ORM instanciou ao
 * carregar a linha (herança multi-tabela: existe linha em `authors`, ou não existe). Isso é despacho
 * polimórfico, e não tradução de campos — é exatamente o que um gerador de mapeadores não poderia
 * decidir, e é o mesmo motivo pelo qual o `UserViewMapper` da versão Java é escrito à mão enquanto os
 * outros mappers de lá são MapStruct.
 *
 * ## Quem responde a pergunta é o domínio
 * A pergunta é `canWritePosts()`, que é `this is Author` — então o `else` não precisa de cast e o `if`
 * não precisa de `instanceof`. A borda não reimplementa a triagem: ela usa a que o agregado já
 * publica, a mesma que o {@link AuthorPipe} usa para recusar quem não escreve.
 *
 * A diferença entre os dois usos vale dizer: o pipe **autoriza** (e falha se o tipo não bater), este
 * mapper **apresenta** (e aceita os dois). É por isso que não há exceção nenhuma aqui.
 *
 * ## Uma passada, view completa
 * Tudo o que o schema pede sobre um usuário sai desta chamada — os três campos estão na entidade que
 * já foi carregada. O único campo que fica devendo uma consulta é `Author.posts`, e ele a deve porque
 * é uma coleção aberta e paginada: ali a consulta à parte é o desenho certo, não desperdício.
 */
@Injectable()
export class UserViewMapper {
  fromUser(user: User): UserView {
    return user.canWritePosts() ? this.fromAuthor(user) : new ReaderView(UserViewMapper.fieldsOf(user));
  }

  /**
   * O mesmo, já **tipado como `Author`** — o que o `Post.author` pede.
   *
   * Ali o destino não depende de nada em runtime: o `type Author!` do schema e a chave estrangeira
   * `posts.author_id → authors.id` já decidiram os dois lados. Um método que devolvesse `UserView`
   * obrigaria o resolver a um cast para satisfazer um `!` que o banco garante — e um cast é
   * exatamente onde uma garantia se perde de vista.
   *
   * É o par do `public AuthorView toView(Author author)` da versão Java, e existe pela mesma razão: há
   * chamadores que já sabem o tipo, e fazê-los passar pelo despacho seria desfazer o que eles sabem.
   */
  fromAuthor(author: Author): AuthorView {
    return new AuthorView(UserViewMapper.fieldsOf(author));
  }

  private static fieldsOf(user: User) {
    return { id: user.id, name: user.name, email: user.email };
  }
}
