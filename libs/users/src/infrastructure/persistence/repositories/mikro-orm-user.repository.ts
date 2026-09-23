import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';
import { ACTIVE_FILTER } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete-orm.entity';

import type { Email } from '../../../domain/user/vo/email';
import type { UserId } from '../../../domain/user/vo/user-id';
import { User } from '../../../domain/user/user.entity';
import { UserRepository } from '../../../domain/user/user.repository';

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
    return inRequestContext(this.em, () =>
      this.em.findOne(User, { id: userId }),
    );
  }

  findByEmail(email: Email): Promise<User | null> {
    return inRequestContext(this.em, () => this.em.findOne(User, { email }));
  }

  async restore(userId: UserId): Promise<void> {
    await this.em.nativeUpdate(
      User,
      { id: userId },
      { deleted: { deletedAt: null } },
      { filters: { [ACTIVE_FILTER]: false } },
    );
  }
}
