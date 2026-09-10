import { AUTHOR_ROLE, type User } from '../../domain/user/user.entity';
import { Users } from '../../domain/user/user.factory';
import { UserId } from '../../domain/user/vo/user-id';
import { AuthorView, ReaderView } from '../../dto/graphql/user.view';
import { UserViewMapper } from '../mapper/user-view.mapper';
import { UserQueryResolver } from './user-query.resolver';

/**
 * `me` e o `__resolveType` — as duas metades da pergunta polimórfica, isoladas de GraphQL e de banco.
 *
 * O que se afirma aqui é a costura entre elas: o que o mapper escolheu é o que o `__resolveType`
 * anuncia. Se as duas discordassem, um autor receberia `Reader` no `__typename` e o fragmento
 * `... on Author` deixaria de casar — uma resposta válida e errada, que é o pior tipo.
 */
describe('UserQueryResolver', () => {
  const mapper = new UserViewMapper();
  const resolver = new UserQueryResolver(mapper);
  const now = new Date('2026-09-08T12:00:00.000Z');

  const userWith = (role: string | null): User =>
    Users.register(UserId.generate(), { email: `u+${UserId.generate()}@example.com`, name: 'manuel' }, role, now);

  describe('me', () => {
    it('devolve a view do usuário da sessão, sem pedir nada a ninguém', () => {
      const user = userWith(AUTHOR_ROLE);

      const view = resolver.me(user);

      expect(view).toBeInstanceOf(AuthorView);
      expect(view.id.equals(user.id)).toBe(true);
      expect(view.email.equals(user.email)).toBe(true);
    });

    /** `me` aceita qualquer um que tenha entrado — não é `@CurrentAuthor()`, é `@CurrentUser()`. */
    it('um Reader também tem um me, e ele não é um erro', () => {
      const view = resolver.me(userWith(null));

      expect(view).toBeInstanceOf(ReaderView);
    });
  });

  describe('__resolveType', () => {
    it('traduz a classe da view no nome do tipo do schema', () => {
      expect(resolver.__resolveType(resolver.me(userWith(AUTHOR_ROLE)))).toBe('Author');
      expect(resolver.__resolveType(resolver.me(userWith(null)))).toBe('Reader');
    });

    /**
     * O nome que ele devolve tem de existir no SDL: `Author`/`Reader`, e não `AuthorView`/`ReaderView`.
     * É a tradução que a versão Java faz com duas entradas num `ClassNameTypeResolver`, e errá-la
     * quebra em runtime, no graphql-js, e não na compilação.
     */
    it('devolve o nome do schema, não o da classe', () => {
      const names = [userWith(AUTHOR_ROLE), userWith(null)].map((user) =>
        resolver.__resolveType(resolver.me(user)),
      );

      expect(names).toEqual(['Author', 'Reader']);
      expect(names.some((name) => name.endsWith('View'))).toBe(false);
    });
  });
});
