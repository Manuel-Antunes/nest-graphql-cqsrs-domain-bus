import type {
  AnyEntity,
  EntityClass,
  EntityName,
  EntitySchema,
} from '@mikro-orm/core';
import type { MikroOrmModuleSyncOptions } from '@mikro-orm/nestjs';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import type { DynamicModule, InjectionToken } from '@nestjs/common';
import { Module } from '@nestjs/common';

/** What a module contributes: the schemas of the tables it owns — MikroORM's own entity list. */
export type DatabaseEntities = readonly (
  | string
  | EntityClass<AnyEntity>
  | EntitySchema
)[];

/** Everything any module has declared, in this process. See {@link DatabaseModule.forFeature}. */
const declared = new Set<string | EntityClass<AnyEntity> | EntitySchema>();

type Connection = MikroOrmModuleSyncOptions & { exclusive?: boolean };

/** {@link DatabaseModule.forRootAsync}'s options: the connection, built from what the application injects. */
export interface DatabaseModuleAsyncOptions<Injected extends unknown[]> {
  readonly inject?: InjectionToken[];
  readonly useFactory: (...injected: Injected) => Connection;
}

@Module({})
export class DatabaseModule {
  /**
   * The connection, with the entity list resolved **lazily** — see the note in `CLAUDE.md` on why
   * this is a factory and not `autoLoadEntities`.
   *
   * `exclusive` makes the connection take the entities it was given and nothing else. {@link declared}
   * is filled when a module is **imported**, not when it is booted, so in a process that imports more
   * than it boots — `apps/migrator`, whose list is the one its own modules export — the registry can
   * hold tables its connection has no business with.
   *
   * `@mikro-orm/nestjs`'s own request-context middleware is turned off: the context is
   * `TenancyModule`'s to open, on the tenant's entity manager, and a second one opened on the global
   * manager would resolve every wildcard table to the connection's schema.
   */
  static forRoot(options: Connection): DynamicModule {
    return DatabaseModule.forRootAsync({ useFactory: () => options });
  }

  /** {@link DatabaseModule.forRoot}, with the connection built from injected configuration. */
  static forRootAsync<Injected extends unknown[]>(
    options: DatabaseModuleAsyncOptions<Injected>,
  ): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        MikroOrmModule.forRootAsync({
          driver: PostgreSqlDriver,
          inject: options.inject ?? [],
          useFactory: (...injected: Injected) => {
            const { exclusive = false, ...connection } = options.useFactory(
              ...injected,
            );
            const entities = [
              ...new Set([
                ...(connection.entities ?? []),
                ...(exclusive ? [] : declared),
              ]),
            ] as EntityName<AnyEntity>[];
            return {
              registerRequestContext: false,
              ...connection,
              entities,
              entitiesTs: entities,
            };
          },
        }),
      ],
    };
  }

  static forFeature(entities: DatabaseEntities): DynamicModule {
    entities.forEach((entity) => {
      declared.add(entity);
    });
    const feature = MikroOrmModule.forFeature({
      entities: [...entities] as EntityName<AnyEntity>[],
    });

    return {
      module: DatabaseModule,
      imports: [feature],
      exports: [feature],
    };
  }
}
