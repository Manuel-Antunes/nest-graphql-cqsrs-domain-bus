import { BaseEntity } from '@nestposts/platform/domain/shared/base-entity';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';

export class AuthUser extends BaseEntity {
  id!: CredentialId;

  name!: UserName;

  email!: Email;

  emailVerified = false;

  image: string | null = null;

  role: string | null = null;

  banned: boolean | null = null;

  banReason: string | null = null;

  banExpires: Date | null = null;

  roles(): string[] {
    return (this.role ?? '')
      .split(',')
      .map((role) => role.trim())
      .filter((role) => role.length > 0);
  }

  hasRole(role: string): boolean {
    return this.roles().includes(role);
  }

  isBanned(now: Date): boolean {
    if (!this.banned) {
      return false;
    }
    return this.banExpires === null || this.banExpires.getTime() > now.getTime();
  }
}
