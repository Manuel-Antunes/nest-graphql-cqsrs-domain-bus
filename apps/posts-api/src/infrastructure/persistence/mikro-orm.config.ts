import { DataloaderType } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SoftDeleteSubscriber } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete.subscriber';

/**
 * The connection, and nothing about who uses it: every table reaches the ORM through the module that
 * owns it — `DatabaseModule.forFeature`, in `PostsInfrastructureModule`, `UsersInfrastructureModule`,
 * `IdentityModule` and the transport's own module.
 */
export const mikroOrmConfig = (dbName = process.env.POSTS_DB ?? 'data/posts.db') => {
  if (dbName !== ':memory:') {
    mkdirSync(dirname(dbName), { recursive: true });
  }
  return defineConfig({
    dbName,
    subscribers: [new SoftDeleteSubscriber()],
    dataloader: DataloaderType.ALL,
    ensureDatabase: { create: true },
    debug: process.env.MIKRO_ORM_DEBUG === 'true',
  });
};
