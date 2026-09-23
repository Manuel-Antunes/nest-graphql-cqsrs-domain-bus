import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';
import { delegateRef } from '@nestposts/platform/domain/shared/delegation/delegate';

import { Author, Authorship } from '../../../domain/user/author.entity';
import { AuthorRepository } from '../../../domain/user/author.repository';
import type { User } from '../../../domain/user/user.entity';
import type { UserId } from '../../../domain/user/vo/user-id';

@Injectable()
export class MikroOrmAuthorRepository extends AuthorRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  findById(userId: UserId): Promise<Author | null> {
    return inRequestContext(this.em, async () => {
      const authorship = await this.em.findOne(Authorship, { user: userId });
      return authorship && delegateRef(Author, authorship).delegated();
    });
  }

  create(user: User): Promise<Author> {
    return inRequestContext(this.em, async () => {
      const authorship = Authorship.of(user);
      await this.em.persist(authorship).flush();
      return delegateRef(Author, authorship).delegated();
    });
  }
}
