import type { EntitySchema } from '@nestposts/database';
import { defineEntity, p, UnderscoreNamingStrategy } from '@nestposts/database';
import type { BetterAuthOptions } from 'better-auth';
import { getAuthTables } from 'better-auth/db';

interface AuthField {
  type: string | string[];
  required?: boolean;
  unique?: boolean;
  fieldName?: string;
  references?: { model: string; field: string };
}

/**
 * **Better Auth's own description of its schema, turned into MikroORM entities.**
 *
 * Generated rather than written, which is what makes it drift-free: a plugin that adds a table or a
 * column says so in `getAuthTables`, and this follows. A table this repository has something to say
 * about is mapped by hand instead and named in `except`, so it is mapped exactly once.
 */
export class BetterAuthSchema {
  private static readonly LONG_TEXT =
    /token|secret|key|statement|jwks|value|uri|uris|claims|metadata/i;

  private static readonly ID_LENGTH = 64;

  private static readonly naming = new UnderscoreNamingStrategy();

  static tableNameOf(model: string): string {
    return BetterAuthSchema.naming.classToTableName(model);
  }

  /**
   * The entity name Better Auth's adapter will look a model up by — `organization` becomes
   * `Organization`, which is what lets a hand-mapped class be found by it.
   */
  static entityNameOf(model: string): string {
    return BetterAuthSchema.naming.getEntityName(
      BetterAuthSchema.tableNameOf(model),
    );
  }

  static define(
    options: BetterAuthOptions,
    except: readonly string[] = [],
  ): EntitySchema[] {
    const tables = getAuthTables(options);
    const skipped = new Set(except);

    return Object.entries(tables)
      .filter(([model]) => !skipped.has(model))
      .map(([, table]) =>
        defineEntity({
          name: BetterAuthSchema.entityNameOf(table.modelName),
          tableName: BetterAuthSchema.tableNameOf(table.modelName),
          properties: {
            id: p.string().primary().length(BetterAuthSchema.ID_LENGTH),
            ...Object.fromEntries(
              Object.entries(table.fields as Record<string, AuthField>).map(
                ([name, field]) => [
                  name,
                  BetterAuthSchema.toProperty(name, field),
                ],
              ),
            ),
          },
        }),
      ) as unknown as EntitySchema[];
  }

  private static toProperty(name: string, field: AuthField) {
    const type = Array.isArray(field.type) ? 'string[]' : field.type;

    const base = (() => {
      switch (type) {
        case 'boolean':
          return p.boolean();
        case 'date':
          return p.datetime();
        case 'number':
          return p.integer();
        case 'json':
          return p.json<unknown>();
        case 'string[]':
        case 'number[]':
          return p.array();
        default:
          return BetterAuthSchema.LONG_TEXT.test(name) ? p.text() : p.string();
      }
    })();

    const named =
      field.fieldName && field.fieldName !== name
        ? base.fieldName(field.fieldName)
        : base;
    const withNullability = field.required === false ? named.nullable() : named;
    return field.unique ? withNullability.unique() : withNullability;
  }
}
