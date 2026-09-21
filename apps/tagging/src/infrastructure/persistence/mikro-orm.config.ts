import { defineConfig } from '@mikro-orm/sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PostEntitySchema } from '@nestposts/posts/infrastructure/persistence/entities/post-orm.entity';
import { TagSchema } from '@nestposts/posts/infrastructure/persistence/entities/tag-orm.entity';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';
import { eventStoreEntities, transportEntities } from '@nestposts/transport-eventbus';

/**
 * This service writes to two tables and two only, and both belong to the framework: its event store
 * and its inbox.
 *
 * The others are here because the DOMAIN needs its mapping to exist, not its rows: rehydrating a Post
 * builds a reference to its author, and a reference is something MikroORM can only make for an entity
 * it knows. The tables are created and stay empty — this service has no read model, and the Post it
 * decides about comes from its stream, not from a row.
 */
export const mikroOrmConfig = (dbName = process.env.TAGGING_DB ?? 'data/tagging.db') => {
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
      ...eventStoreEntities,
      ...transportEntities,
    ],
    ensureDatabase: { create: true },
    debug: process.env.MIKRO_ORM_DEBUG === 'true',
  });
};
