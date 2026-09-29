import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import type { UserProvisioning } from '@nestposts/users/infrastructure/provisioning/user-provisioning.service';

import { SessionNotAuthenticatedException } from '../domain/auth/exception/session-not-authenticated.exception';
import { Identity } from '../domain/auth/vo/identity';
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
    const identity = Identity.parse({
      userId: 'cred-1',
      email: 'manuel@example.com',
      name: 'manuel',
      roles: ['user'],
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
});
