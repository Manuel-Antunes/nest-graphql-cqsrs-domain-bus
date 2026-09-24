import { MikroORM } from '@mikro-orm/postgresql';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { MigratorModule } from './migrator.module';

export interface MigratorContext {
  readonly app: INestApplicationContext;
  readonly orm: MikroORM;
}

const LOG_LEVELS = ['error', 'warn', 'log'] as const;

export const bootstrap = async (): Promise<MigratorContext> => {
  const app = await NestFactory.createApplicationContext(MigratorModule, {
    logger: [...LOG_LEVELS],
    abortOnError: false,
  });
  return { app, orm: app.get(MikroORM) };
};

export const withMigrator = async <T>(
  work: (context: MigratorContext) => Promise<T>,
): Promise<T> => {
  const context = await bootstrap();
  try {
    return await work(context);
  } finally {
    await context.app.close();
  }
};

export const liveSchemas = (orm: MikroORM): Promise<string[]> =>
  orm.em
    .fork()
    .getConnection()
    .execute<{ nspname: string }[]>(
      `select nspname from pg_namespace where nspname not like 'pg\\_%' and nspname <> 'information_schema'`,
    )
    .then((rows) => rows.map((row) => row.nspname))
    .catch(() => []);
