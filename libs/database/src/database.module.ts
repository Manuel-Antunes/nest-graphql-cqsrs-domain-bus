import type {
  AnyEntity,
  EntityClass,
  EntityName,
  EntitySchema,
} from '@mikro-orm/core';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';

import type { DatabaseConfig } from './config/database.config';
import { databaseConfig } from './config/database.config';
import type { PostgresOptions } from './connection/postgres-database';
import { postgresDatabase } from './connection/postgres-database';
import { DatabaseExceptionFilter } from './filters/database-exception.filter';

/** What a module contributes: the schemas of the tables it owns — MikroORM's own entity list. */
export type DatabaseEntities = readonly (
  | string
  | EntityClass<AnyEntity>
  | EntitySchema
)[];

/** Everything any module has declared, in this process. See {@link DatabaseModule.forFeature}. */
const declared = new Set<string | EntityClass<AnyEntity> | EntitySchema>();

type Connection = PostgresOptions & { exclusive?: boolean };

@Module({})
export class DatabaseModule {
  /**
   * The connection: {@link databaseConfig} — `POSTGRES_URL` and `MIKRO_ORM_DEBUG`, registered here with
   * `ConfigModule.forFeature` and injected, so an application loads nothing — under whatever it passes
   * of its own (`dataloader`, the migrator's migrations and seeders), on the system schema unless it
   * says otherwise.
   *
   * The entity list is resolved **lazily** — see the note in `CLAUDE.md` on why this is a factory and
   * not `autoLoadEntities`.
   *
   * `exclusive` makes the connection take the entities it was given and nothing else. {@link declared}
   * is filled when a module is **imported**, not when it is booted, so in a process that imports more
   * than it boots — `apps/migrator`, whose list is the one its own modules export — the registry can
   * hold tables its connection has no business with.
   *
   * `@mikro-orm/nestjs`'s own request-context middleware is turned off: the context is
   * `TenancyModule`'s to open, on the tenant's entity manager, and a second one opened on the global
   * manager would resolve every wildcard table to the connection's schema.
   *
   * It also installs {@link DatabaseExceptionFilter} globally: a database failure reaches every
   * application that holds a connection, and each context answers it in its own words.
   */
  static forRoot(options: Connection = {}): DynamicModule {
    const { exclusive = false, ...connection } = options;
    return {
      module: DatabaseModule,
      imports: [
        MikroOrmModule.forRootAsync({
          driver: PostgreSqlDriver,
          imports: [ConfigModule.forFeature(databaseConfig)],
          inject: [databaseConfig.KEY],
          useFactory: (database: DatabaseConfig) => {
            const entities = [
              ...new Set([
                ...(connection.entities ?? []),
                ...(exclusive ? [] : declared),
              ]),
            ] as EntityName<AnyEntity>[];
            return {
              registerRequestContext: false,
              ...postgresDatabase(connection, database),
              entities,
              entitiesTs: entities,
            };
          },
        }),
      ],
      providers: [{ provide: APP_FILTER, useClass: DatabaseExceptionFilter }],
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
