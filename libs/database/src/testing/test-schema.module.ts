import type {
  BeforeApplicationShutdown,
  DynamicModule,
  OnModuleInit,
} from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import { Inject, Injectable, Module } from '@nestjs/common';

import type { AnyMikroORM } from './test-database';
import { dropTestSchema, ensureTestSchema } from './test-database';

@Injectable()
class TestSchemaLifecycle implements OnModuleInit, BeforeApplicationShutdown {
  constructor(@Inject(MikroORM) private readonly orm: AnyMikroORM) {}

  onModuleInit(): Promise<void> {
    return ensureTestSchema(this.orm);
  }

  beforeApplicationShutdown(): Promise<void> {
    return dropTestSchema(this.orm);
  }
}

/**
 * The schema a spec's connection was pointed at, created on `init()` and dropped on `close()`.
 *
 * It is what a Nest-booting spec imports instead of calling {@link ensureTestSchema} by hand:
 * `beforeApplicationShutdown` runs while the connection is still open, which `onApplicationShutdown`
 * does not guarantee — MikroORM closes the ORM in its own shutdown hook.
 */
@Module({})
export class TestSchemaModule {
  static forRoot(): DynamicModule {
    return { module: TestSchemaModule, providers: [TestSchemaLifecycle] };
  }
}
