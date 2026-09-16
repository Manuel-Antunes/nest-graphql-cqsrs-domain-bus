import { Author } from '../../domain/user/author.entity';
import { Reader } from '../../domain/user/reader.entity';
import { AUTHOR_ROLE, User } from '../../domain/user/user.entity';
import { UserId } from '../../domain/user/vo/user-id';
import { AuthorView, ReaderView } from '../../dto/graphql/user.view';
import { UserQueryResolver } from './user-query.resolver';

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
    it('devolve o usuário da sessão como veio', () => {
      const user = anAuthor();

      expect(resolver.me(user)).toBe(user);
    });

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

    it('devolve o nome do schema, não o da classe', () => {
      const names = [anAuthor(), aReader()].map((user) =>
        resolver.__resolveType(viewOf(user)),
      );

      expect(names).toEqual(['Author', 'Reader']);
      expect(names.some((name) => name.endsWith('View'))).toBe(false);
    });
  });
});
