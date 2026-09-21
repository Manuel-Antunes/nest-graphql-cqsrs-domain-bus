import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { AuthorView, UserView } from '../../dto/graphql/user.view';
import { UserQueryResolver } from './user-query.resolver';

describe('UserQueryResolver', () => {
  const resolver = new UserQueryResolver();
  const now = new Date('2026-09-08T12:00:00.000Z');

  const aUser = (roles: readonly string[]): User =>
    User.register(UserId.generate(), { email: `u+${UserId.generate()}@example.com`, name: 'manuel' }, roles, now);

  const viewOf = (user: User) => {
    const state = { id: user.id, name: user.name, email: user.email };
    return user.hasRole(AUTHOR_ROLE) ? new AuthorView(state) : new UserView(state);
  };

  describe('me', () => {
    it('hands back the session user as it came', () => {
      const user = aUser([AUTHOR_ROLE]);

      expect(resolver.me(user)).toBe(user);
    });

    it('a user with no role also has a me, and it is not an error', () => {
      const user = aUser([]);

      expect(resolver.me(user)).toBe(user);
    });
  });

  describe('__resolveType', () => {
    it('translates the view class into the schema type name', () => {
      expect(resolver.__resolveType(viewOf(aUser([AUTHOR_ROLE])))).toBe('Author');
      expect(resolver.__resolveType(viewOf(aUser([])))).toBe('User');
    });

    it('answers with the schema name, not the class name', () => {
      const names = [aUser([AUTHOR_ROLE]), aUser([])].map((user) => resolver.__resolveType(viewOf(user)));

      expect(names).toEqual(['Author', 'User']);
      expect(names.some((name) => name.endsWith('View'))).toBe(false);
    });
  });
});
