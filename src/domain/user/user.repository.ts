import type { Email } from './vo/email';
import type { User } from './user.entity';
import type { UserId } from './vo/user-id';

export abstract class UserRepository {
  abstract save(user: User): Promise<void>;

  abstract saveAll(users: readonly User[]): Promise<void>;
  abstract findById(userId: UserId): Promise<User | null>;
  abstract findActiveByEmail(email: Email): Promise<User | null>;
  abstract findSupersededBy(userId: UserId): Promise<User | null>;

  abstract findSupersededByEmail(email: Email): Promise<User | null>;

  abstract restore(userId: UserId): Promise<void>;
}
