import { MikroORM } from '@mikro-orm/core';
import type { FactoryProvider } from '@nestjs/common';
import { mikroOrmAdapter } from 'better-auth-mikro-orm';
import { BETTER_AUTH_ADAPTER } from '../tokens';

export const BetterAuthAdapterFactory = {
  provide: BETTER_AUTH_ADAPTER,
  useFactory: (orm: MikroORM) => mikroOrmAdapter(orm),
  inject: [MikroORM],
} satisfies FactoryProvider;
