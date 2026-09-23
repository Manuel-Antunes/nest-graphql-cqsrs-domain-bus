import { join } from 'node:path';
import type { DatabaseEntities, PostgresOptions } from '@nestposts/database';
import { Migrator } from '@mikro-orm/migrations';
import { SeedManager } from '@mikro-orm/seeder';
import {
  postgresDatabase,
  POSTS_SCHEMA,
  TAGGING_SCHEMA,
} from '@nestposts/database';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { SoftDeleteSubscriber } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete.subscriber';
import { postsEntities } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { eventLogEntities } from '@nestposts/transport-eventbus/persistence/event-log/event-log.entity';
import { transportEntities } from '@nestposts/transport-eventbus/persistence/message-inbox.entity';
import { usersEntities } from '@nestposts/users/infrastructure/users-infrastructure.module';

import { postsMigrations } from '../migrations/posts';
import { taggingMigrations } from '../migrations/tagging';
import { DatabaseSeeder } from '../seeders/database.seeder';
import { DefaultTagSeeder } from '../seeders/default-tag.seeder';
import { TestUsersSeeder } from '../seeders/test-users.seeder';

/**
 * Where `migration:create` writes and what it diffs against. `migrationsList` is what `up()` runs —
 * a glob has no meaning in a bundle — but the CLI still needs somewhere to put a new file.
 */
const migrationFiles = (folder: string) => ({
  path: join(__dirname, '..', 'migrations', folder),
  pathTs: join(__dirname, '..', '..', 'src', 'migrations', folder),
  glob: '!(*.d).{js,ts,cjs}',
  emit: 'ts' as const,
  snapshot: false,
});

export const postsSchema = (): string =>
  process.env.POSTS_SCHEMA ?? POSTS_SCHEMA;

export const taggingSchema = (): string =>
  process.env.TAGGING_SCHEMA ?? TAGGING_SCHEMA;

export const postsTables = (): DatabaseEntities => [
  ...postsEntities,
  ...usersEntities,
  ...OrganizationEntities.withAuth(),
  ...transportEntities,
  ...eventLogEntities,
];

export const taggingTables = (): DatabaseEntities => [
  ...postsEntities,
  ...usersEntities,
  ...transportEntities,
  ...eventLogEntities,
];

export const postsConnection = (): PostgresOptions =>
  postgresDatabase(postsSchema(), {
    preferTs: false,
    entities: [...postsTables()],
    subscribers: [new SoftDeleteSubscriber()],
    extensions: [Migrator, SeedManager],
    migrations: { ...migrationFiles('posts'), migrationsList: postsMigrations },
    seeder: {
      seedersList: [DatabaseSeeder, DefaultTagSeeder, TestUsersSeeder],
      defaultSeeder: 'DatabaseSeeder',
      emit: 'ts',
    },
  });

export const taggingConnection = (): PostgresOptions =>
  postgresDatabase(taggingSchema(), {
    preferTs: false,
    entities: [...taggingTables()],
    extensions: [Migrator],
    migrations: {
      ...migrationFiles('tagging'),
      migrationsList: taggingMigrations,
    },
  });
