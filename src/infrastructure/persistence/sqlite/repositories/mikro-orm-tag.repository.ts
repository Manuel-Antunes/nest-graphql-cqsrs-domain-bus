import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { Tag } from '../../../../domain/tag/tag.entity';
import { TagRepository } from '../../../../domain/tag/tag.repository';
import type { TagId } from '../../../../domain/tag/vo/tag-id';
import type { TagName } from '../../../../domain/tag/vo/tag-name';

/** Adapter da porta `TagRepository` sobre o MikroORM. */
@Injectable()
export class MikroOrmTagRepository extends TagRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async save(tag: Tag): Promise<void> {
    await this.em.persist(tag).flush();
  }

  findById(tagId: TagId): Promise<Tag | null> {
    return this.em.findOne(Tag, { id: tagId });
  }

  findByName(name: TagName): Promise<Tag | null> {
    return this.em.findOne(Tag, { name });
  }
}
