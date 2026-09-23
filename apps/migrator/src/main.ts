import type { MikroORM } from '@mikro-orm/postgresql';
import type { Seeder } from '@mikro-orm/seeder';

import type { MigratorContext } from './app/bootstrap';
import { withPosts, withTagging } from './app/bootstrap';
import { withSeederContainer } from './seeders/container';
import { DatabaseSeeder } from './seeders/database.seeder';
import { DefaultTagSeeder } from './seeders/default-tag.seeder';
import { TestUsersSeeder } from './seeders/test-users.seeder';

export type SeederClass = new () => Seeder;

const applyMigrations = async ({ orm }: MigratorContext): Promise<void> => {
  await orm.schema.ensureDatabase();
  await orm.schema.createNamespace(orm.config.get('schema'));
  await (orm as MikroORM).migrator.up();
};

export const migratePosts = (): Promise<void> => withPosts(applyMigrations);

export const migrateTagging = (): Promise<void> => withTagging(applyMigrations);

export async function migrate(): Promise<void> {
  await migratePosts();
  await migrateTagging();
}

export const seed = (
  seeders: SeederClass[] = [DatabaseSeeder],
): Promise<void> =>
  withPosts(({ app, orm }) =>
    withSeederContainer(app, () => (orm as MikroORM).seeder.seed(...seeders)),
  );

export const seedUsers = (): Promise<void> => seed([TestUsersSeeder]);

export const seedDeployment = (): Promise<void> => seed([DatabaseSeeder]);

export async function setup(): Promise<void> {
  await migrate();
  await seed([DefaultTagSeeder]);
}

export { bootstrap, withPosts, withTagging } from './app/bootstrap';
export { postsSchema, taggingSchema } from './app/connections';
export { PostsMigratorModule } from './app/posts.module';
export { TaggingMigratorModule } from './app/tagging.module';
export { DatabaseSeeder } from './seeders/database.seeder';
export { DefaultTagSeeder } from './seeders/default-tag.seeder';
export {
  SEED_PASSWORD,
  seededUsers,
  TestUsersSeeder,
} from './seeders/test-users.seeder';

const commands: Record<string, () => Promise<unknown>> = {
  migrate,
  'migrate:posts': migratePosts,
  'migrate:tagging': migrateTagging,
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
