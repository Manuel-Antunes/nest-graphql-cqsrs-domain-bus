import type { INestApplicationContext } from '@nestjs/common';

let current: INestApplicationContext | undefined;

export const withSeederContainer = async <T>(
  app: INestApplicationContext,
  work: () => Promise<T>,
): Promise<T> => {
  const previous = current;
  current = app;
  try {
    return await work();
  } finally {
    current = previous;
  }
};

export const seederContainer = (): INestApplicationContext => {
  if (!current) {
    throw new Error(
      'no container is open: a seeder that resolves a provider has to run through seed() in apps/migrator, not through the MikroORM CLI',
    );
  }
  return current;
};
