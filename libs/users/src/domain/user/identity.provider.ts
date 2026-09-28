import type { UserId } from './vo/user-id';

export abstract class IdentityProvider {
  abstract grantRole(userId: UserId, role: string): Promise<void>;

  abstract addRole(userId: UserId, role: string): Promise<void>;

  abstract removeRole(userId: UserId, role: string): Promise<void>;
}
