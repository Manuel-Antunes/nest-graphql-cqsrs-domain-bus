import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { UserProvisioning } from '../../application/user/user-provisioning.service';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { SessionUserPipe } from './session-user.pipe';

describe('SessionUserPipe', () => {
  const profile = { id: 'quem-quer-que-seja' } as unknown as User;
  let asked: CredentialId[];
  let pipe: SessionUserPipe;

  beforeEach(() => {
    asked = [];
    const provisioning = {
      provision: async (credentialId: CredentialId) => {
        asked.push(credentialId);
        return profile;
      },
    } as unknown as UserProvisioning;
    pipe = new SessionUserPipe(provisioning);
  });

  const sessionFor = (user: object) => ({ user }) as unknown as UserSession;

  it('provisiona o perfil pelo id da credencial da sessão', async () => {
    const session = sessionFor({ id: 'cred-1', email: 'manuel@example.com', name: 'manuel' });

    const user = await pipe.transform(session);

    expect(user).toBe(profile);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeInstanceOf(CredentialId);
    expect(asked[0].value).toBe('cred-1');
  });

  it('aceita a sessão ainda como Promise, que é como o Nest a entrega ao primeiro pipe', async () => {
    const session = Promise.resolve(sessionFor({ id: 'cred-2', email: 'manuel@example.com' }));

    const user = await pipe.transform(session);

    expect(user).toBe(profile);
    expect(asked[0].value).toBe('cred-2');
  });
});
