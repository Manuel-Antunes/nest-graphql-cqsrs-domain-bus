import { join } from 'node:path';
import { Migrator } from '@mikro-orm/migrations';
import { SeedManager } from '@mikro-orm/seeder';
import type { DatabaseEntities, PostgresOptions } from '@nestposts/database';
import { postgresDatabase, SYSTEM_SCHEMA } from '@nestposts/database';
import { eventsEntities } from '@nestposts/events/infrastructure/events-infrastructure.module';
import { notificationsEntities } from '@nestposts/notifications/infrastructure/notifications-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { outboxEntities } from '@nestposts/outbox-mikro-orm/outbox.entities';
import { SoftDeleteSubscriber } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete.subscriber';
import { postsEntities } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { eventLogEntities } from '@nestposts/transport-eventbus/persistence/event-log/event-log.entity';
import { usersEntities } from '@nestposts/users/infrastructure/users-infrastructure.module';

import type { PostgresConfig } from '../config/postgres.config';
import { postgresConfig } from '../config/postgres.config';
import { systemMigrations } from '../migrations/system';
import { tenantMigrations } from '../migrations/tenant';
import { DatabaseSeeder } from '../seeders/database.seeder';
import { OAuthResourcesSeeder } from '../seeders/oauth-resources.seeder';
import { TestUsersSeeder } from '../seeders/test-users.seeder';

export type MigrationSet = 'system' | 'tenant';

export const migrationFiles = (set: MigrationSet) => ({
  path: join(__dirname, '..', 'migrations', set),
  pathTs: join(__dirname, '..', '..', 'src', 'migrations', set),
  glob: '!(*.d|index).{js,ts,cjs}',
  emit: 'ts' as const,
  snapshot: false,
  migrationsList: set === 'system' ? systemMigrations : tenantMigrations,
});

export const migratorTables = (): DatabaseEntities => [
  ...OrganizationEntities.withAuth(),
  ...postsEntities,
  ...usersEntities,
  ...eventsEntities,
  ...notificationsEntities,
  ...outboxEntities,
  ...eventLogEntities,
];

export const systemConnection = (
  { url, debug }: PostgresConfig = postgresConfig(),
): PostgresOptions =>
  postgresDatabase(SYSTEM_SCHEMA, {
    clientUrl: url,
    debug,
    preferTs: false,
    entities: [...migratorTables()],
    subscribers: [new SoftDeleteSubscriber()],
    extensions: [Migrator, SeedManager],
    migrations: migrationFiles('system'),
    seeder: {
      seedersList: [DatabaseSeeder, OAuthResourcesSeeder, TestUsersSeeder],
      defaultSeeder: 'DatabaseSeeder',
      emit: 'ts',
    },
  });
