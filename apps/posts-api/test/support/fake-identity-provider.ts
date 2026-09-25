import type { Identity } from '@nestposts/users/domain/user/identity.provider';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';

export class FakeIdentityProvider extends IdentityProvider {
  private readonly credentials = new Map<string, Identity>();
  private sequence = 0;

  signUp(
    email: string,
    name: string,
    role: string | null = null,
  ): CredentialId {
    const credentialId = CredentialId.parse(`cred-${++this.sequence}`);
    this.credentials.set(credentialId.value, {
      credentialId,
      email: Email.parse(email),
      name: UserName.parse(name),
      role,
    });
    return credentialId;
  }

  forget(credentialId: CredentialId): void {
    this.credentials.delete(credentialId.value);
  }

  async findById(credentialId: CredentialId): Promise<Identity | null> {
    return this.credentials.get(credentialId.value) ?? null;
  }

  async grantRole(credentialId: CredentialId, role: string): Promise<Identity> {
    const identity = this.credentials.get(credentialId.value);
    if (!identity) {
      throw new Error(`credencial desconhecida: ${credentialId}`);
    }
    const updated = { ...identity, role };
    this.credentials.set(credentialId.value, updated);
    return updated;
  }

  async addRole(credentialId: CredentialId, role: string): Promise<Identity> {
    const held = await this.rolesOf(credentialId);
    return this.grantRole(
      credentialId,
      [...new Set([...held, role])].join(','),
    );
  }

  async removeRole(
    credentialId: CredentialId,
    role: string,
  ): Promise<Identity> {
    const held = await this.rolesOf(credentialId);
    return this.grantRole(
      credentialId,
      held.filter((existing) => existing !== role).join(',') || 'user',
    );
  }

  private async rolesOf(credentialId: CredentialId): Promise<string[]> {
    const role = (await this.findById(credentialId))?.role;
    return role ? role.split(',') : [];
  }
}
