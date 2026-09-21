import { defineEntity, type EntitySchema, p, UnderscoreNamingStrategy } from '@mikro-orm/core';
import { getAuthTables } from 'better-auth/db';
import type { BetterAuthOptions } from 'better-auth';

const LONG_TEXT = /token|secret|key|statement|jwks|value|uri|uris|claims/i;

type AuthField = {
  type: string | string[];
  required?: boolean;
  unique?: boolean;
  references?: { model: string; field: string };
};

function toProperty(name: string, field: AuthField) {
  const type = Array.isArray(field.type) ? 'string[]' : field.type;
  const optional = field.required === false;

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
        return LONG_TEXT.test(name) ? p.text() : p.string();
    }
  })();

  const withNullability = optional ? base.nullable() : base;
  return field.unique ? withNullability.unique() : withNullability;
}

const naming = new UnderscoreNamingStrategy();
const tableNameOf = (model: string) => naming.classToTableName(model);
const entityNameOf = (model: string) => naming.getEntityName(tableNameOf(model));

export function defineBetterAuthEntities(options: BetterAuthOptions): EntitySchema[] {
  const tables = getAuthTables(options);
  return Object.entries(tables).map(([model, table]) =>
    defineEntity({
      name: entityNameOf(table.modelName),
      tableName: tableNameOf(table.modelName),
      properties: {
        id: p.string().primary().length(64),
        ...Object.fromEntries(
          Object.entries(tables[model]!.fields as Record<string, AuthField>).map(([name, field]) => [
            name,
            toProperty(name, field),
          ]),
        ),
      },
    }),
  ) as unknown as EntitySchema[];
}
