import type { MikroORM } from '@mikro-orm/postgresql';
import type { Seeder } from '@mikro-orm/seeder';
import { Logger } from '@nestjs/common';
import type { RedisSecondaryStorage } from '@nestposts/auth/infrastructure/better-auth/storage/redis-secondary-storage';
import { BETTER_AUTH_SECONDARY_STORAGE } from '@nestposts/auth/infrastructure/better-auth/tokens';
import {
  ROOT_TENANT,
  TENANT_SCHEMA_PREFIX,
  Tenant,
  TenantEntityManagerService,
} from '@nestposts/database';
import { OutboxInboxEntitySchema } from '@nestposts/outbox-mikro-orm/outbox.entities';

import type { MigratorContext } from './app/bootstrap';
import { liveSchemas, withMigrator } from './app/bootstrap';
import { migrationFiles } from './app/connections';
import { ChatwootMirror } from './chatwoot/chatwoot-mirror';
import type { OutboxConfig } from './config/outbox.config';
import { outboxConfig } from './config/outbox.config';
import { withSeederContainer } from './seeders/container';
import { DatabaseSeeder } from './seeders/database.seeder';
import { OAuthResourcesSeeder } from './seeders/oauth-resources.seeder';
import { TestUsersSeeder } from './seeders/test-users.seeder';

export type SeederClass = new () => Seeder;

const TENANT_SCHEMA = new RegExp(`^${TENANT_SCHEMA_PREFIX}_(.+)$`);

export const tenantsIn = async (orm: MikroORM): Promise<string[]> => {
  const tenants = (await liveSchemas(orm))
    .map((schema) => TENANT_SCHEMA.exec(schema)?.[1])
    .filter((tenant): tenant is string => Boolean(tenant));
  return [ROOT_TENANT, ...tenants.filter((tenant) => tenant !== ROOT_TENANT)];
};

const applySystemMigrations = async ({ orm }: MigratorContext) => {
  await orm.schema.ensureDatabase();
  await orm.migrator.up();
};

const applyTenantMigrations = async ({ orm }: MigratorContext) => {
  const tenants = new TenantEntityManagerService(orm, migrationFiles('tenant'));
  for (const tenant of await tenantsIn(orm)) {
    await tenants.provision(tenant);
  }
};

const forgetAuthStorage = async ({ app }: MigratorContext) => {
  const storage = app.get<RedisSecondaryStorage | null>(
    BETTER_AUTH_SECONDARY_STORAGE,
    { strict: false },
  );
  if (!storage) return;
  const forgotten = await storage.clear();
  Logger.log(
    `better-auth's secondary storage cleared: ${forgotten} key(s) forgotten`,
    'Migrator',
  );
};

const DAY_MS = 86_400_000;

const forgetProcessedMessages = async ({ app, orm }: MigratorContext) => {
  const { inboxRetentionDays } = app.get<OutboxConfig>(outboxConfig.KEY);
  const forgotten = await orm.em.fork().nativeDelete(OutboxInboxEntitySchema, {
    processedAt: { $lt: new Date(Date.now() - inboxRetentionDays * DAY_MS) },
  });
  Logger.log(
    `inbox pruned: ${forgotten} message(s) processed more than ${inboxRetentionDays} day(s) ago forgotten`,
    'Migrator',
  );
  return forgotten;
};

export const migrateSystem = (): Promise<void> =>
  withMigrator(applySystemMigrations);

export const migrateTenants = (): Promise<void> =>
  withMigrator(applyTenantMigrations);

export const pruneInbox = (): Promise<number> =>
  withMigrator(forgetProcessedMessages);

export const mirrorChatwoot = (): Promise<number> =>
  withMigrator(({ orm }) => ChatwootMirror.backfill(orm));

export async function migrate(): Promise<void> {
  await migrateSystem();
  await migrateTenants();
  await pruneInbox();
  await mirrorChatwoot();
}

export const seed = (
  seeders: SeederClass[] = [DatabaseSeeder],
): Promise<void> =>
  withMigrator(({ app, orm }) =>
    withSeederContainer(app, () => orm.seeder.seed(...seeders)),
  );

export const seedUsers = (): Promise<void> => seed([TestUsersSeeder]);

export const seedDeployment = (): Promise<void> => seed([DatabaseSeeder]);

export const fresh = async (): Promise<void> => {
  await withMigrator(async (context) => {
    const { orm } = context;
    for (const tenant of await tenantsIn(orm)) {
      await orm.em
        .fork()
        .getConnection()
        .execute(`drop schema if exists "${Tenant.schemaOf(tenant)}" cascade`);
    }
    await orm.schema.drop({ dropMigrationsTable: true });
    await forgetAuthStorage(context);
  });
  await migrate();
  await seed();
};

export async function setup(): Promise<void> {
  await migrate();
  await seed([OAuthResourcesSeeder]);
}

export { bootstrap, withMigrator } from './app/bootstrap';
export { MigratorModule } from './app/migrator.module';
export { seedConfig } from './config/seed.config';
export { DatabaseSeeder } from './seeders/database.seeder';
export { OAuthResourcesSeeder } from './seeders/oauth-resources.seeder';
export { TestUsersSeeder } from './seeders/test-users.seeder';

const commands: Record<string, () => Promise<unknown>> = {
  fresh,
  migrate,
  'migrate:system': migrateSystem,
  'migrate:tenants': migrateTenants,
  'inbox:prune': pruneInbox,
  'chatwoot:mirror': mirrorChatwoot,
  'seed': () => seed(),
  'seed:users': seedUsers,
  'seed:deployment': seedDeployment,
  setup,
};

if (require.main === module) {
  const name = process.argv[2] ?? 'setup';
  const command = commands[name];
  if (!command) {
    console.error(
      `unknown command "${name}"; expected one of ${Object.keys(commands).join(', ')}`,
    );
    process.exit(1);
  }
  command().then(
    () => process.exit(0),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
