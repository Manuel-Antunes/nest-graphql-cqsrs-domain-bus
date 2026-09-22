import type {
  AnyEntity,
  EntityClass,
  EntityName,
  EntitySchema,
} from "@mikro-orm/core";
import {
  MikroOrmModule,
  type MikroOrmModuleSyncOptions,
} from "@mikro-orm/nestjs";
import { type DynamicModule, Module } from "@nestjs/common";

/** What a module contributes: the schemas of the tables it owns — MikroORM's own entity list. */
export type DatabaseEntities = readonly (
  | string
  | EntityClass<AnyEntity>
  | EntitySchema
)[];

/** Everything any module has declared, in this process. See {@link DatabaseModule.forFeature}. */
const declared = new Set<string | EntityClass<AnyEntity> | EntitySchema>();

@Module({})
export class DatabaseModule {
  /**
   * The connection, with the entity list resolved **lazily** — see the note in `CLAUDE.md` on why
   * this is a factory and not `autoLoadEntities`.
   *
   * `exclusive` is for the one process that has more than one of these: `apps/migrator`, which has a
   * Nest module per migrated database. {@link declared} is filled when a module is **imported**, not
   * when it is booted, so by the time either migrator module boots, the registry already holds the
   * union of both — and `tagging` would be handed `posts`' `auth_user`. Exclusive, the connection
   * takes the entities it was given and nothing else, which is the same list the modules that own
   * those tables already export.
   */
  static forRoot(
    options: MikroOrmModuleSyncOptions & { exclusive?: boolean },
  ): DynamicModule {
    const { exclusive = false, ...connection } = options;
    return {
      module: DatabaseModule,
      imports: [
        MikroOrmModule.forRootAsync({
          useFactory: () => {
            const entities = [
              ...new Set([
                ...(connection.entities ?? []),
                ...(exclusive ? [] : declared),
              ]),
            ] as EntityName<AnyEntity>[];
            return { ...connection, entities, entitiesTs: entities };
          },
        }),
      ],
    };
  }

  static forFeature(entities: DatabaseEntities): DynamicModule {
    entities.forEach(entity => declared.add(entity));
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
