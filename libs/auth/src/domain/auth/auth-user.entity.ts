import type { Attachment } from '@nestposts/asset/domain/asset/attachment';
import { User } from '@nestposts/users/domain/user/user.entity';

export class AuthUser extends User {
  emailVerified = false;

  image: Attachment | null = null;

  banned: boolean | null = null;

  banReason: string | null = null;

  banExpires: Date | null = null;

  twoFactorEnabled: boolean | null = false;

  isBanned(now: Date): boolean {
    if (!this.banned) {
      return false;
    }
    return (
      this.banExpires === null || this.banExpires.getTime() > now.getTime()
    );
  }
}
