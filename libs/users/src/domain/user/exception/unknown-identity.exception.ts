import type { UserId } from '../vo/user-id';

export class UnknownIdentityException extends Error {
  constructor(readonly userId: UserId) {
    super(`no user ${userId} stands behind the session`);
    this.name = 'UnknownIdentityException';
  }
}
