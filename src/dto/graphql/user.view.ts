import { z } from 'zod';
import { InheritValidatedMetadata, ValidatedDto } from '../../validated-dto/mixins';
import { Email } from '../../domain/user/vo/email';
import { UserId } from '../../domain/user/vo/user-id';
import { UserName } from '../../domain/user/vo/user-name';

/**
 * Os três campos que todo User tem — o `interface User` do schema, como shape validado.
 *
 * Um schema só para os dois tipos concretos, porque no domínio eles também não diferem em campo
 * nenhum: `Reader` e `Author` têm a mesma forma, e o que os separa é o que um deles *pode fazer*. Se
 * um dia o `Author` ganhar a `bio` que o da versão Axon tem, é aqui que o schema dele se separa.
 */
const UserViewSchema = z.object({
  id: UserId.field(),
  name: UserName.field(),
  email: Email.field(),
});

/**
 * A base gerada, compartilhada pelas duas views.
 *
 * Ela existe nomeada (em vez de `extends ValidatedDto(UserViewSchema)` duas vezes) porque cada chamada
 * do mixin **gera uma classe nova**, com os seus próprios decorators: duas chamadas dariam duas
 * hierarquias paralelas para o mesmo shape. Uma base, duas subclasses — e o `instanceof` de cada uma
 * continua distinguindo, que é justamente o que o `__resolveType` precisa.
 */
const UserViewBase = ValidatedDto(UserViewSchema);

/** O `type Reader` do schema. O nome bate com a classe de domínio: os dois nasceram juntos. */
@InheritValidatedMetadata()
export class ReaderView extends UserViewBase {}

/**
 * O `type Author` do schema.
 *
 * Não tem campo a mais que o `ReaderView` — e é o ponto. O que o `Author` tem de diferente é
 * `posts`, que **não** é um campo da view: é um resolver que vai ao banco (ver `AuthorPostsResolver`).
 * O tipo é o que carrega a diferença; a view só precisa ser reconhecível.
 */
@InheritValidatedMetadata()
export class AuthorView extends UserViewBase {}

/**
 * O `interface User` do schema, deste lado: a **união** dos dois tipos concretos.
 *
 * É o `sealed interface UserView permits ReaderView, AuthorView` da versão Java, com a mesma
 * propriedade útil: um terceiro tipo no schema não compila sem par aqui, porque `UserViewMapper`
 * precisa devolver um destes dois. A união é só de tipo — em runtime o que existe são as classes, e é
 * por elas que o `__resolveType` decide.
 */
export type UserView = ReaderView | AuthorView;
