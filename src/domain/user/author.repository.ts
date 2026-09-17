import type { Author } from './author.entity';
import type { User } from './user.entity';
import type { UserId } from './vo/user-id';

export abstract class AuthorRepository {
  abstract findById(userId: UserId): Promise<Author | null>;
  abstract create(user: User): Promise<Author>;
}
