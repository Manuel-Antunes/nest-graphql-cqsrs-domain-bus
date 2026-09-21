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
  static forRoot(options: MikroOrmModuleSyncOptions): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        MikroOrmModule.forRootAsync({
          useFactory: () => {
            const entities = [
              ...new Set([...(options.entities ?? []), ...declared]),
            ] as EntityName<AnyEntity>[];
            return { ...options, entities, entitiesTs: entities };
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
