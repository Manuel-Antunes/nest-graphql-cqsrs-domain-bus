import type { UserId } from '../vo/user-id';

export class UserNotFoundException extends Error {
  constructor(readonly userId: UserId) {
    super(`user ${userId} does not exist`);
    this.name = 'UserNotFoundException';
  }
}
