import { EntityManager } from '@mikro-orm/core';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { inRequestContext } from '@nestposts/platform/infrastructure/persistence/request-context';
import { DEFAULT_TAG_ID, DEFAULT_TAG_NAME, Tag } from '@nestposts/posts/domain/tag/tag.entity';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';

@Injectable()
export class DefaultTagSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(DefaultTagSeeder.name);

  constructor(private readonly em: EntityManager) {}

  async onApplicationBootstrap(): Promise<void> {
    await inRequestContext(this.em, async () => {
      const em = this.em.fork();
      const id = TagId.parse(DEFAULT_TAG_ID);
      if (await em.findOne(Tag, { id })) {
        return;
      }
      const tag = Tag.create(id, DEFAULT_TAG_NAME, new Date());
      tag.uncommit();
      await em.persist(tag).flush();
      this.logger.log(`tag ${DEFAULT_TAG_NAME} (${DEFAULT_TAG_ID}) seeded`);
    });
  }
}
