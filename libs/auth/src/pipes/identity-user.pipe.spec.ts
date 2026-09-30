import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import type { UserProvisioning } from '@nestposts/users/infrastructure/provisioning/user-provisioning.service';

import { IdentityIsNotAUserException } from '../domain/auth/exception/identity-is-not-a-user.exception';
import { SessionNotAuthenticatedException } from '../domain/auth/exception/session-not-authenticated.exception';
import { ClientIdentity } from '../domain/auth/vo/client-identity';
import { UserIdentity } from '../domain/auth/vo/user-identity';
import { IdentityUserPipe } from './identity-user.pipe';

describe('IdentityUserPipe', () => {
  const profile = { id: 'whoever' } as unknown as User;
  let asked: UserId[];
  let pipe: IdentityUserPipe;

  beforeEach(() => {
    asked = [];
    const provisioning = {
      provision: async (userId: UserId) => {
        asked.push(userId);
        return profile;
      },
    } as unknown as UserProvisioning;
    pipe = new IdentityUserPipe(provisioning);
  });

  it('provisions the user the caller’s identity names', async () => {
    const identity = UserIdentity.parse({
      userId: 'cred-1',
      email: 'manuel@example.com',
      name: 'manuel',
      roles: ['user'],
      scopes: [],
    });

    const user = await pipe.transform(identity);

    expect(user).toBe(profile);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeInstanceOf(UserId);
    expect(asked[0].value).toBe('cred-1');
  });

  it('refuses nobody', async () => {
    await expect(pipe.transform(null)).rejects.toBeInstanceOf(
      SessionNotAuthenticatedException,
    );
    expect(asked).toHaveLength(0);
  });

  it('refuses an OAuth client, which is no user to provision', async () => {
    const client = ClientIdentity.parse({
      clientId: 'machine',
      scopes: ['read:posts'],
    });

    await expect(pipe.transform(client)).rejects.toBeInstanceOf(
      IdentityIsNotAUserException,
    );
    expect(asked).toHaveLength(0);
  });
});
