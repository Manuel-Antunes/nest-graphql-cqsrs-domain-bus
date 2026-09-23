import type { TestingModule } from '@nestjs/testing';
import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import {
  Author,
  AUTHOR_ROLE,
  Authorship,
} from '@nestposts/users/domain/user/author.entity';
import { AuthorRepository } from '@nestposts/users/domain/user/author.repository';
import { UnknownIdentityException } from '@nestposts/users/domain/user/exception/unknown-identity.exception';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';
import { User } from '@nestposts/users/domain/user/user.entity';

import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../test/support/cqrs-testing-module';
import { FakeIdentityProvider } from '../../../test/support/fake-identity-provider';
import { UserProvisioning } from './user-provisioning.service';

describe('UserProvisioning', () => {
  let module: TestingModule;
  let provisioning: UserProvisioning;
  let authors: AuthorRepository;
  let identities: FakeIdentityProvider;
  let credentialId: CredentialId;

  const EMAIL = 'manuel@example.com';

  const signUp = (role: string | null = null) => {
    credentialId = identities.signUp(EMAIL, 'Manuel', role);
    return credentialId;
  };

  const provision = (id: CredentialId = credentialId) =>
    inRequestContext(module, () => provisioning.provision(id));

  const countAuthorships = () => freshEm(module).count(Authorship);

  beforeEach(async () => {
    identities = new FakeIdentityProvider();
    module = await createCqrsTestingModule([
      UserProvisioning,
      { provide: IdentityProvider, useValue: identities },
    ]);
    provisioning = module.get(UserProvisioning);
    authors = module.get(AuthorRepository);
    signUp();
  });

  afterEach(() => module.close());

  it('the first access creates the domain profile', async () => {
    const user = await provision();

    expect(user).toBeInstanceOf(User);
    expect(user.email.value).toBe(EMAIL);
    expect(user.roles).toEqual([]);
    expect(await freshEm(module).count(User)).toBe(1);
    expect(await countAuthorships()).toBe(0);
  });

  it('the second access reuses the profile instead of creating another', async () => {
    const first = await provision();

    const second = await provision();

    expect(second.id.equals(first.id)).toBe(true);
    expect(await freshEm(module).count(User)).toBe(1);
  });

  it('whoever arrives already as an author gets the role and the authorship row', async () => {
    signUp(AUTHOR_ROLE);

    const user = await provision();

    expect(user.hasRole(AUTHOR_ROLE)).toBe(true);
    expect(await countAuthorships()).toBe(1);
    expect(await freshEm(module).count(User)).toBe(1);
  });

  it('a credential the provider does not know does not become a profile', async () => {
    identities.forget(credentialId);

    await expect(provision()).rejects.toBeInstanceOf(UnknownIdentityException);
    expect(await freshEm(module).count(User)).toBe(0);
  });

  it('another credential with the same email reuses the profile that already exists', async () => {
    const first = await provision();

    const other = identities.signUp(EMAIL, 'Manuel');
    const same = await provision(other);

    expect(same.id.equals(first.id)).toBe(true);
    expect(await freshEm(module).count(User)).toBe(1);
  });

  describe('promotion is a row, not a second identity', () => {
    const promote = async () => {
      await identities.grantRole(credentialId, AUTHOR_ROLE);
      return provision();
    };

    it('promoting keeps the very same user id and adds one authorship', async () => {
      const before = await provision();

      const after = await promote();

      expect(after.id.equals(before.id)).toBe(true);
      expect(after.hasRole(AUTHOR_ROLE)).toBe(true);
      expect(await freshEm(module).count(User)).toBe(1);
      expect(await countAuthorships()).toBe(1);
    });

    it('the promoted user reads back as an Author, cast over the row that was just created', async () => {
      await provision();
      const promoted = await promote();

      const author = await inRequestContext(module, () =>
        authors.findById(promoted.id),
      );

      expect(author).toBeInstanceOf(Author);
      expect(author!.authorship.id.equals(promoted.id)).toBe(true);
      expect(author!.hasRole(AUTHOR_ROLE)).toBe(true);
    });

    it('provisioning again after the promotion changes nothing', async () => {
      await provision();
      const promoted = await promote();

      const again = await provision();

      expect(again.id.equals(promoted.id)).toBe(true);
      expect(again.roles).toEqual([AUTHOR_ROLE]);
      expect(await freshEm(module).count(User)).toBe(1);
      expect(await countAuthorships()).toBe(1);
    });

    it('the version tells the promotion happened on the same stream', async () => {
      const before = await provision();
      expect(before.version).toBe(1);

      const after = await promote();

      expect(after.version).toBe(2);
    });
  });
});
