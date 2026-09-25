import { Injectable, Logger } from '@nestjs/common';
import { EventPublisher } from '@nestjs/cqrs';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { AuthorRepository } from '@nestposts/users/domain/user/author.repository';
import { UnknownIdentityException } from '@nestposts/users/domain/user/exception/unknown-identity.exception';
import type { Identity } from '@nestposts/users/domain/user/identity.provider';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserRepository } from '@nestposts/users/domain/user/user.repository';
import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

@Injectable()
export class UserProvisioning {
  private readonly logger = new Logger(UserProvisioning.name);

  constructor(
    private readonly identities: IdentityProvider,
    private readonly users: UserRepository,
    private readonly authors: AuthorRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async provision(credentialId: CredentialId, now = new Date()): Promise<User> {
    const identity = await this.identities.findById(credentialId);
    if (!identity) {
      throw new UnknownIdentityException(credentialId);
    }
    const roles = rolesOf(identity);
    const existing = await this.users.findByEmail(identity.email);
    const user = existing ?? (await this.register(identity, roles, now));
    return this.granting(user, roles, now);
  }

  private async register(
    identity: Identity,
    roles: readonly string[],
    now: Date,
  ): Promise<User> {
    const user = this.publisher.mergeObjectContext(
      User.register(
        UserId.generate(),
        { email: identity.email, name: identity.name },
        roles,
        now,
      ),
    );
    await this.users.save(user);
    user.commit();
    return user;
  }

  private async granting(
    user: User,
    roles: readonly string[],
    now: Date,
  ): Promise<User> {
    for (const role of roles) {
      if (!user.hasRole(role)) {
        this.logger.log(
          `concedendo o papel ${role} a ${user.email}: ${user.id}`,
        );
        this.publisher.mergeObjectContext(user).grantRole(role, now);
        await this.users.save(user);
        user.commit();
      }
    }
    if (user.hasRole(AUTHOR_ROLE) && !(await this.authors.findById(user.id))) {
      await this.authors.create(user);
    }
    return user;
  }
}

function rolesOf(identity: Identity): readonly string[] {
  return (identity.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
}
