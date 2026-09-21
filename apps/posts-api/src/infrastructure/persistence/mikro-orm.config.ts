import { DataloaderType } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PostEntitySchema } from '@nestposts/posts/infrastructure/persistence/entities/post-orm.entity';
import { SoftDeleteSubscriber } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete.subscriber';
import { TagSchema } from '@nestposts/posts/infrastructure/persistence/entities/tag-orm.entity';
import { AuthorshipEntitySchema, UserEntitySchema } from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';
import { betterAuthEntities } from '@nestposts/users/infrastructure/auth/auth';
import { transportEntities } from '@nestposts/transport-eventbus';

export const mikroOrmConfig = (dbName = process.env.POSTS_DB ?? 'data/posts.db') => {
  if (dbName !== ':memory:') {
    mkdirSync(dirname(dbName), { recursive: true });
  }
  return defineConfig({
    dbName,
    entities: [
      PostEntitySchema,
      TagSchema,
      UserEntitySchema,
      AuthorshipEntitySchema,
      ...betterAuthEntities,
      ...transportEntities,
    ],
    subscribers: [new SoftDeleteSubscriber()],
    dataloader: DataloaderType.ALL,
    ensureDatabase: { create: true },
    debug: process.env.MIKRO_ORM_DEBUG === 'true',
  });
};
