import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { UserIdentity } from '@nestposts/auth/domain/auth/vo/user-identity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

export class ChatOwner {
  static of(identity: Identity | null): UserId {
    return UserId.parse(UserIdentity.required(identity).userId.value);
  }

  static isThe(identity: Identity | null, userId: string): boolean {
    return identity?.kind === 'user' && identity.userId.value === userId;
  }
}
