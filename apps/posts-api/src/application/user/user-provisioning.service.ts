import { Injectable, Logger } from '@nestjs/common';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { AuthorRepository } from '@nestposts/users/domain/user/author.repository';
import { UnknownIdentityException } from '@nestposts/users/domain/user/exception/unknown-identity.exception';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserRepository } from '@nestposts/users/domain/user/user.repository';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

@Injectable()
export class UserProvisioning {
  private readonly logger = new Logger(UserProvisioning.name);

  constructor(
    private readonly users: UserRepository,
    private readonly authors: AuthorRepository,
  ) {}

  async provision(userId: UserId): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnknownIdentityException(userId);
    }
    if (await this.isProvisioned(user)) {
      return user;
    }
    await this.users.exclusively(user.email, async () => {
      const current = await this.users.findById(userId);
      if (current && !(await this.isProvisioned(current))) {
        this.logger.log(
          `making ${current.email} an author here: ${current.id}`,
        );
        await this.authors.create(current);
      }
    });
    return user;
  }

  private async isProvisioned(user: User): Promise<boolean> {
    return (
      !user.hasRole(AUTHOR_ROLE) ||
      (await this.authors.findById(user.id)) !== null
    );
  }
}
