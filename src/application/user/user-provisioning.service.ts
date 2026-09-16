import { Injectable, Logger } from '@nestjs/common';
import { EventPublisher } from '@nestjs/cqrs';
import { UnknownIdentityException } from '../../domain/user/exception/unknown-identity.exception';
import { type Identity, IdentityProvider } from '../../domain/user/identity.provider';
import { Author } from '../../domain/user/author.entity';
import { Reader } from '../../domain/user/reader.entity';
import { AUTHOR_ROLE, User } from '../../domain/user/user.entity';
import { UserRepository } from '../../domain/user/user.repository';
import type { CredentialId } from '../../domain/user/vo/credential-id';
import { UserId } from '../../domain/user/vo/user-id';

@Injectable()
export class UserProvisioning {
  private readonly logger = new Logger(UserProvisioning.name);

  constructor(
    private readonly identities: IdentityProvider,
    private readonly users: UserRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async provision(credentialId: CredentialId, now = new Date()): Promise<User> {
    const identity = await this.identities.findById(credentialId);
    if (!identity) {
      throw new UnknownIdentityException(credentialId);
    }

    const existing = await this.users.findActiveByEmail(identity.email);
    if (!existing) {
      return this.register(identity, now, await this.pendingPromotionId(identity));
    }
    if (identity.role === AUTHOR_ROLE && !existing.canWritePosts()) {
      return this.promote(existing, identity, now);
    }
    return existing;
  }

  private async pendingPromotionId(identity: Identity): Promise<UserId | null> {
    const orphan = await this.users.findSupersededByEmail(identity.email);
    if (!orphan?.supersededBy) {
      return null;
    }
    if (await this.users.findById(orphan.supersededBy.id)) {
      return null;
    }
    this.logger.warn(
      `promoção interrompida detectada para ${identity.email}: retomando o id ${orphan.supersededBy.id}`,
    );
    return orphan.supersededBy.id;
  }

  private profileFor(role: string | null): typeof Author | typeof Reader {
    return role === AUTHOR_ROLE ? Author : Reader;
  }

  private async register(identity: Identity, now: Date, resume: UserId | null): Promise<User> {
    const superseded = resume ? await this.users.findSupersededBy(resume) : null;
    const user = this.publisher.mergeObjectContext(
      this.profileFor(identity.role).register(
        resume ?? UserId.generate(),
        { email: identity.email, name: identity.name },
        identity.role,
        now,
        superseded?.id ?? null,
      ),
    );
    await this.users.save(user);
    user.commit();
    return user;
  }

  private async promote(reader: User, identity: Identity, now: Date): Promise<Author> {
    const promotedId = UserId.generate();
    this.logger.log(`promovendo ${reader.email} de Reader para Author: ${reader.id} → ${promotedId}`);

    this.publisher.mergeObjectContext(reader).supersede(promotedId, now);
    const author = this.publisher.mergeObjectContext(
      Author.register(
        promotedId,
        { email: reader.email, name: identity.name },
        AUTHOR_ROLE,
        now,
        reader.id,
      ),
    );
    await this.users.saveAll([author, reader]);
    reader.commit();
    author.commit();
    return author;
  }
}
