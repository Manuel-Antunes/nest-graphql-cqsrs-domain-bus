import type { TestingModule } from '@nestjs/testing';
import {
  AUTHOR_ROLE,
  Author,
  Authorship,
} from '@nestposts/users/domain/user/author.entity';
import { AuthorRepository } from '@nestposts/users/domain/user/author.repository';
import { UnknownIdentityException } from '@nestposts/users/domain/user/exception/unknown-identity.exception';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../test/support/cqrs-testing-module';
import { T0 } from '../../../test/support/post-fixtures';
import { UserProvisioning } from './user-provisioning.service';

describe('UserProvisioning', () => {
  let module: TestingModule;
  let provisioning: UserProvisioning;
  let authors: AuthorRepository;
  let userId: UserId;

  const EMAIL = 'manuel@example.com';

  const signUp = async (role: string | null = null) => {
    const user = User.register(
      UserId.generate(),
      { email: EMAIL, name: 'Manuel' },
      [],
      T0,
    );
    user.role = role;
    user.uncommit();
    await freshEm(module).persist(user).flush();
    userId = user.id;
    return user;
  };

  const authenticationSetsRole = (role: string) =>
    freshEm(module).nativeUpdate(User, { id: userId }, { role });

  const provision = (id: UserId = userId) =>
    inRequestContext(module, () => provisioning.provision(id));

  const countAuthorships = () => freshEm(module).count(Authorship);

  beforeEach(async () => {
    module = await createCqrsTestingModule([UserProvisioning]);
    provisioning = module.get(UserProvisioning);
    authors = module.get(AuthorRepository);
  });

  afterEach(() => module.close());

  it('a reader is the user authentication wrote, and nothing is created for them', async () => {
    await signUp();

    const user = await provision();

    expect(user).toBeInstanceOf(User);
    expect(user.id.equals(userId)).toBe(true);
    expect(user.email.value).toBe(EMAIL);
    expect(user.roles).toEqual([]);
    expect(await freshEm(module).count(User)).toBe(1);
    expect(await countAuthorships()).toBe(0);
  });

  it('an author gets the authorship row of this tenant', async () => {
    await signUp(AUTHOR_ROLE);

    const user = await provision();

    expect(user.hasRole(AUTHOR_ROLE)).toBe(true);
    expect(await countAuthorships()).toBe(1);
    expect(await freshEm(module).count(User)).toBe(1);
  });

  it('a user holding several roles, the way Better Auth stores them, is an author too', async () => {
    await signUp(`user,${AUTHOR_ROLE}`);

    const user = await provision();

    expect(user.roles).toEqual(['user', AUTHOR_ROLE]);
    expect(await countAuthorships()).toBe(1);
  });

  it('a session whose user does not exist is refused', async () => {
    await expect(provision(UserId.generate())).rejects.toBeInstanceOf(
      UnknownIdentityException,
    );
    expect(await countAuthorships()).toBe(0);
  });

  it('provisioning again changes nothing', async () => {
    await signUp(AUTHOR_ROLE);
    const first = await provision();

    const again = await provision();

    expect(again.id.equals(first.id)).toBe(true);
    expect(await freshEm(module).count(User)).toBe(1);
    expect(await countAuthorships()).toBe(1);
  });

  describe('requests that meet an author at once', () => {
    const AT_ONCE = 4;

    const atOnce = () =>
      Promise.all(Array.from({ length: AT_ONCE }, () => provision()));

    beforeEach(async () => {
      await Promise.all(
        Array.from({ length: AT_ONCE }, () =>
          freshEm(module).getConnection().execute('select pg_sleep(0.05)'),
        ),
      );
    });

    it('give them one authorship between them', async () => {
      await signUp(AUTHOR_ROLE);

      const users = await atOnce();

      expect(users.every((user) => user.hasRole(AUTHOR_ROLE))).toBe(true);
      expect(await countAuthorships()).toBe(1);
    });

    it('promote a reader once', async () => {
      await signUp();
      await provision();
      await authenticationSetsRole(AUTHOR_ROLE);

      const users = await atOnce();

      expect(users.every((user) => user.hasRole(AUTHOR_ROLE))).toBe(true);
      expect(await countAuthorships()).toBe(1);
    });
  });

  describe('promotion is a row, not a second identity', () => {
    const promote = async () => {
      await authenticationSetsRole(AUTHOR_ROLE);
      return provision();
    };

    it('promoting keeps the very same user and adds one authorship', async () => {
      await signUp();
      const before = await provision();

      const after = await promote();

      expect(after.id.equals(before.id)).toBe(true);
      expect(after.hasRole(AUTHOR_ROLE)).toBe(true);
      expect(await freshEm(module).count(User)).toBe(1);
      expect(await countAuthorships()).toBe(1);
    });

    it('the promoted user reads back as an Author, cast over the row that was just created', async () => {
      await signUp();
      await provision();
      const promoted = await promote();

      const author = await inRequestContext(module, () =>
        authors.findById(promoted.id),
      );

      expect(author).toBeInstanceOf(Author);
      expect(author?.authorship.id.equals(promoted.id)).toBe(true);
      expect(author?.hasRole(AUTHOR_ROLE)).toBe(true);
    });
  });
});
