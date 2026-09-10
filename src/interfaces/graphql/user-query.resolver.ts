import { Query, ResolveField, Resolver } from '@nestjs/graphql';
import type { User } from '../../domain/user/user.entity';
import { AuthorView, type UserView } from '../../dto/graphql/user.view';
import { CurrentUser } from '../decorators/current-user.decorator';
import { UserViewMapper } from '../mapper/user-view.mapper';

/**
 * A query `me` — quem está logado — e a peça que faz dela uma pergunta **polimórfica**.
 *
 * ## O ponto polimórfico do schema
 * O retorno declarado é `User`, a interface. Quem decide se o cliente recebe um `Reader` ou um
 * `Author` é o tipo que saiu do banco: o {@link UserViewMapper} despacha por `canWritePosts()`, e o
 * `__resolveType` logo abaixo traduz a classe do DTO no nome do schema.
 *
 * Ou seja: `me { ... on Author { posts { … } } }` só traz posts para quem tem linha em `authors`. Não
 * há campo a forjar no token — o `@Roles` barra cedo, pelo papel que veio no cookie, mas o que
 * **aparece** na resposta vem da hierarquia real.
 *
 * ## Onde está a exigência de sessão
 * Não está escrita aqui, e é por isso que este resolver **não** tem `@AllowAnonymous()`: o guard do
 * `@thallesp/nestjs-better-auth` é global, então o caminho padrão já é "precisa de sessão", e as
 * leituras de post são a exceção que opta por fora (ver a lacuna conhecida no `PostQueryResolver`).
 * `me: User!` é não-nulo justamente porque o anônimo nunca chega até aqui.
 *
 * ## O upcast não é assunto deste resolver
 * `@CurrentUser()` entrega um `User` — a raiz, não o `Author`. É o oposto do que as mutations pedem
 * (`@CurrentAuthor()`, que recusa um Reader), e é o certo para cá: `me` responde a qualquer um que
 * tenha entrado. Ver {@link CurrentUser}.
 */
@Resolver('User')
export class UserQueryResolver {
  constructor(private readonly viewMapper: UserViewMapper) {}

  @Query('me')
  me(@CurrentUser() user: User): UserView {
    return this.viewMapper.fromUser(user);
  }

  /**
   * Diz ao graphql-js qual tipo concreto um `User` é, em runtime.
   *
   * É o `GraphQlTypeResolverConfig` da versão Java — lá um `ClassNameTypeResolver` com duas entradas
   * num `@Bean`, aqui um método que o @nestjs/graphql reconhece pelo nome e pendura no tipo nomeado
   * no `@Resolver('User')`. O mapeamento é necessário pelo mesmo motivo nas duas: o nome da classe é
   * `AuthorView`, e o do tipo do schema é `Author`. Manter o sufixo é deliberado — ele diz que aquilo
   * é DTO de saída e não a entidade `Author`, e num projeto onde as duas convivem isso evita o import
   * errado.
   *
   * Um `instanceof` e não um `'campo' in value`: as duas views têm exatamente os mesmos campos, então
   * não há campo que as distinga — o que as distingue é a classe, que é justamente o que o
   * {@link UserViewMapper} decidiu. Guards e filters não correm neste método (o @nestjs/graphql os
   * desliga para o `__resolveType`), e nem deveriam: ele não busca nada, só lê o tipo do que já está
   * em mãos.
   */
  @ResolveField()
  __resolveType(value: UserView): string {
    return value instanceof AuthorView ? 'Author' : 'Reader';
  }
}
