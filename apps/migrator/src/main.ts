import type { Seeder } from '@mikro-orm/seeder';
import { MikroORM } from '@mikro-orm/postgresql';
import type { MigratedDatabaseConfig } from './connection';
import postsConfig from './posts-mikro-orm.config';
import { DatabaseSeeder } from './seeders/database.seeder';
import taggingConfig from './tagging-mikro-orm.config';

export type SeederClass = new () => Seeder;

async function withOrm<T>(config: MigratedDatabaseConfig, work: (orm: MikroORM) => Promise<T>): Promise<T> {
  const orm = (await MikroORM.init(await config())) as MikroORM;
  try {
    return await work(orm);
  } finally {
    await orm.close(true);
  }
}

const applyMigrations = async (orm: MikroORM): Promise<void> => {
  await orm.schema.ensureDatabase();
  await orm.schema.createNamespace(orm.config.get('schema'));
  await orm.migrator.up();
};

export const migratePosts = (): Promise<void> => withOrm(postsConfig, applyMigrations);

export const migrateTagging = (): Promise<void> => withOrm(taggingConfig, applyMigrations);

export async function migrate(): Promise<void> {
  await migratePosts();
  await migrateTagging();
}

export const seed = (seeders: SeederClass[] = [DatabaseSeeder]): Promise<void> =>
  withOrm(postsConfig, orm => orm.seeder.seed(...seeders));

export async function setup(): Promise<void> {
  await migrate();
  await seed();
}

export { DatabaseSeeder } from './seeders/database.seeder';
export { DefaultTagSeeder } from './seeders/default-tag.seeder';

const commands: Record<string, () => Promise<unknown>> = {
  migrate,
  'migrate:posts': migratePosts,
  'migrate:tagging': migrateTagging,
  seed: () => seed(),
  setup,
};

if (require.main === module) {
  const name = process.argv[2] ?? 'setup';
  const command = commands[name];
  if (!command) {
    console.error(`unknown command "${name}"; expected one of ${Object.keys(commands).join(', ')}`);
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
