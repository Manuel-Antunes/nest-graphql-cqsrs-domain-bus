import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '../../request-context';
import { User } from '../../../../domain/user/user.entity';
import { UserRepository } from '../../../../domain/user/user.repository';
import type { Email } from '../../../../domain/user/vo/email';
import type { UserId } from '../../../../domain/user/vo/user-id';
import { ACTIVE_FILTER } from '../soft-delete/soft-delete-orm.entity';

@Injectable()
export class MikroOrmUserRepository extends UserRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async save(user: User): Promise<void> {
    await this.em.persist(user).flush();
  }

  async saveAll(users: readonly User[]): Promise<void> {
    await this.em.persist([...users]).flush();
  }

  findById(userId: UserId): Promise<User | null> {
    return inRequestContext(this.em, () => this.em.findOne(User, { id: userId }));
  }

  findActiveByEmail(email: Email): Promise<User | null> {
    return this.em.findOne(User, { email, supersededBy: null });
  }

  async restore(userId: UserId): Promise<void> {
    await this.em.nativeUpdate(
      User,
      { id: userId },
      { deleted: { deletedAt: null } },
      { filters: { [ACTIVE_FILTER]: false } },
    );
  }

  findSupersededBy(userId: UserId): Promise<User | null> {
    return this.em.findOne(User, { supersededBy: userId });
  }

  findSupersededByEmail(email: Email): Promise<User | null> {
    return this.em.findOne(
      User,
      { email, supersededBy: { $ne: null } },
      { orderBy: { createdAt: 'desc' } },
    );
  }
}
