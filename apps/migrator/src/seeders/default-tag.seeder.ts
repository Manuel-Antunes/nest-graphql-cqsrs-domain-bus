import type { EntityManager } from '@mikro-orm/postgresql';
import { Seeder } from '@mikro-orm/seeder';
import {
  DEFAULT_TAG_ID,
  DEFAULT_TAG_NAME,
  Tag,
} from '@nestposts/posts/domain/tag/tag.entity';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';

export class DefaultTagSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const id = TagId.parse(DEFAULT_TAG_ID);
    if (await em.findOne(Tag, { id })) {
      return;
    }
    const tag = Tag.create(id, DEFAULT_TAG_NAME, new Date());
    tag.uncommit();
    em.persist(tag);
  }
}
