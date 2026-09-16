import { Author } from '../../domain/user/author.entity';
import { Reader } from '../../domain/user/reader.entity';
import { AUTHOR_ROLE, User } from '../../domain/user/user.entity';
import { UserId } from '../../domain/user/vo/user-id';
import { AuthorView, ReaderView } from '../../dto/graphql/user.view';
import { UserQueryResolver } from './user-query.resolver';

/**
 * `me` e o `__resolveType`, isolados de GraphQL e de banco.
 *
 * O `me` encolheu para uma linha — ele devolve o usuário da sessão, e quem escolhe a view é o
 * {@link UserViewInterceptor}, que tem os testes do despacho. O que continua morando aqui é a outra
 * metade da pergunta polimórfica: o `__resolveType`, que traduz a **classe** da view no nome do tipo
 * do schema.
 *
 * A costura entre as duas metades é o que não pode quebrar: se o interceptor escolhesse uma view e o
 * `__resolveType` anunciasse outra, um autor receberia `Reader` no `__typename` e o fragmento
 * `... on Author` deixaria de casar — uma resposta válida e errada, que é o pior tipo. É por isso que
 * os testes abaixo partem das classes de view em pessoa, e não do que o interceptor devolveu.
 */
describe('UserQueryResolver', () => {
  const resolver = new UserQueryResolver();
  const now = new Date('2026-09-08T12:00:00.000Z');

  const anEmail = () => `u+${UserId.generate()}@example.com`;
  const anAuthor = (): User =>
    Author.register(UserId.generate(), { email: anEmail(), name: 'manuel' }, AUTHOR_ROLE, now);
  const aReader = (): User =>
    Reader.register(UserId.generate(), { email: anEmail(), name: 'manuel' }, null, now);

  const viewOf = (user: User) =>
    user.canWritePosts()
      ? new AuthorView({ id: user.id, name: user.name, email: user.email })
      : new ReaderView({ id: user.id, name: user.name, email: user.email });

  describe('me', () => {
    /**
     * Ele não pede nada a ninguém, e é o ponto: o usuário já chegou resolvido pelo `@CurrentUser()`,
     * e a tradução é do interceptor. Um `me` que voltasse a consultar seria uma consulta a mais por
     * requisição para responder o que a sessão já tinha respondido.
     */
    it('devolve o usuário da sessão como veio', () => {
      const user = anAuthor();

      expect(resolver.me(user)).toBe(user);
    });

    /** `me` aceita qualquer um que tenha entrado — não é `@CurrentAuthor()`, é `@CurrentUser()`. */
    it('um Reader também tem um me, e ele não é um erro', () => {
      const reader = aReader();

      expect(resolver.me(reader)).toBe(reader);
    });
  });

  describe('__resolveType', () => {
    it('traduz a classe da view no nome do tipo do schema', () => {
      expect(resolver.__resolveType(viewOf(anAuthor()))).toBe('Author');
      expect(resolver.__resolveType(viewOf(aReader()))).toBe('Reader');
    });

    /**
     * O nome que ele devolve tem de existir no SDL: `Author`/`Reader`, e não `AuthorView`/`ReaderView`.
     * É a tradução que a versão Java faz com duas entradas num `ClassNameTypeResolver`, e errá-la
     * quebra em runtime, no graphql-js, e não na compilação.
     */
    it('devolve o nome do schema, não o da classe', () => {
      const names = [anAuthor(), aReader()].map((user) =>
        resolver.__resolveType(viewOf(user)),
      );

      expect(names).toEqual(['Author', 'Reader']);
      expect(names.some((name) => name.endsWith('View'))).toBe(false);
    });
  });
});
