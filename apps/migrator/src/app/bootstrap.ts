import { MikroORM } from '@mikro-orm/postgresql';
import { type INestApplicationContext, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { PostsMigratorModule } from './posts.module';
import { TaggingMigratorModule } from './tagging.module';

export interface MigratorContext {
  readonly app: INestApplicationContext;
  readonly orm: MikroORM;
}

const LOG_LEVELS = ['error', 'warn', 'log'] as const;

export const bootstrap = async (module: Type): Promise<MigratorContext> => {
  const app = await NestFactory.createApplicationContext(module, {
    logger: [...LOG_LEVELS],
    abortOnError: false,
  });
  return { app, orm: app.get(MikroORM) };
};

export const withPosts = <T>(
  work: (context: MigratorContext) => Promise<T>,
): Promise<T> => within(PostsMigratorModule, work);

export const withTagging = <T>(
  work: (context: MigratorContext) => Promise<T>,
): Promise<T> => within(TaggingMigratorModule, work);

const within = async <T>(
  module: Type,
  work: (context: MigratorContext) => Promise<T>,
): Promise<T> => {
  const context = await bootstrap(module);
  try {
    return await work(context);
  } finally {
    await context.app.close();
  }
};
