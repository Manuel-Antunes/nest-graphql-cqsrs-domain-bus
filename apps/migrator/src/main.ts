import type { MikroORM } from '@mikro-orm/postgresql';
import type { Seeder } from '@mikro-orm/seeder';
import {
  ROOT_TENANT,
  TENANT_SCHEMA_PREFIX,
  Tenant,
  TenantEntityManagerService,
} from '@nestposts/database';

import type { MigratorContext } from './app/bootstrap';
import { liveSchemas, withMigrator } from './app/bootstrap';
import { migrationFiles } from './app/connections';
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

export const migrateSystem = (): Promise<void> =>
  withMigrator(applySystemMigrations);

export const migrateTenants = (): Promise<void> =>
  withMigrator(applyTenantMigrations);

export async function migrate(): Promise<void> {
  await migrateSystem();
  await migrateTenants();
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
  await withMigrator(async ({ orm }) => {
    for (const tenant of await tenantsIn(orm)) {
      await orm.em
        .fork()
        .getConnection()
        .execute(`drop schema if exists "${Tenant.schemaOf(tenant)}" cascade`);
    }
    await orm.schema.drop({ dropMigrationsTable: true });
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
