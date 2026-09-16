import { DataloaderType } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PostSchema } from './entities/post-orm.entity';
import { SoftDeleteSubscriber } from './soft-delete/soft-delete.subscriber';
import { TagSchema } from './entities/tag-orm.entity';
import { AuthorSchema, ReaderSchema, UserSchema } from './entities/user-orm.entity';
import { betterAuthEntities } from '../../auth/auth';

export const mikroOrmConfig = (dbName = process.env.POSTS_DB ?? 'data/posts.db') => {
  if (dbName !== ':memory:') {
    mkdirSync(dirname(dbName), { recursive: true });
  }
  return defineConfig({
    dbName,
    entities: [PostSchema, TagSchema, UserSchema, ReaderSchema, AuthorSchema, ...betterAuthEntities],
    subscribers: [new SoftDeleteSubscriber()],
    dataloader: DataloaderType.ALL,
    ensureDatabase: { create: true },
    debug: process.env.MIKRO_ORM_DEBUG === 'true',
  });
};
