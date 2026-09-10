import { defineEntity, type EntitySchema, p, UnderscoreNamingStrategy } from '@mikro-orm/core';
import { getAuthTables } from 'better-auth/db';
import type { BetterAuthOptions } from 'better-auth';

/**
 * Os schemas MikroORM das tabelas do Better Auth — **gerados**, não escritos à mão.
 *
 * O Better Auth publica o próprio schema em `getAuthTables(options)`: dadas as opções (com os
 * plugins), ele devolve cada modelo com seus campos, tipos, obrigatoriedade, unicidade e referências.
 * Com `jwt`, `admin` e `oauthProvider` ligados isso dá **12 tabelas e ~130 campos** — que, escritos à
 * mão, seriam um espelho para manter em sincronia a cada `pnpm up`. É o mesmo motivo pelo qual não
 * existe um `PostEntity` ao lado do `Post`: a duplicata é que estraga.
 *
 * Ligar um plugin novo no {@link auth} passa a bastar: as tabelas dele aparecem aqui sozinhas.
 *
 * ## O que é traduzido
 * | Better Auth | MikroORM |
 * |---|---|
 * | `string` | `p.string()` (ou `p.text()` quando é campo de token/segredo) |
 * | `boolean` | `p.boolean()` |
 * | `date` | `p.datetime()` |
 * | `number` | `p.integer()` |
 * | `string[]` | `p.array()` (JSON na coluna) |
 * | `json` | `p.json()` |
 *
 * As referências (`userId -> user.id`) ficam como **coluna escalar**, e não como `manyToOne`. É de
 * propósito: as tabelas de autenticação são um grafo do Better Auth, não do nosso domínio — quem
 * decide o que é consistente ali é ele, pelo adapter. Um `manyToOne` colocaria essas linhas na mesma
 * fronteira transacional dos agregados, que é justamente o que a camada quer evitar.
 */

/** Campos que guardam segredo ou token: `text`, porque não têm tamanho previsível. */
const LONG_TEXT = /token|secret|key|statement|jwks|value|uri|uris|claims/i;

type AuthField = {
  type: string | string[];
  required?: boolean;
  unique?: boolean;
  references?: { model: string; field: string };
};

/** Um campo do Better Auth → uma propriedade do MikroORM. */
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

/**
 * A convenção de nomes é ditada pelo adapter, não por nós: para achar a entidade de um modelo ele faz
 * `naming.getEntityName(naming.classToTableName(model))`. Com a estratégia padrão isso leva
 * `oauthClient` → tabela `oauth_client` → entidade `OauthClient`. Registrar com outro nome faz o
 * adapter estourar `Cannot find metadata for "User" entity` na primeira consulta — então os dois
 * nomes saem daqui, pela mesma estratégia.
 */
const naming = new UnderscoreNamingStrategy();
const tableNameOf = (model: string) => naming.classToTableName(model);
const entityNameOf = (model: string) => naming.getEntityName(tableNameOf(model));

/**
 * Gera um `EntitySchema` por tabela do Better Auth, a partir das opções que o `auth` usa.
 * O `id` não vem em `getAuthTables` (é implícito); é adicionado aqui como chave primária string —
 * quem a gera é o Better Auth, então o `generateId` dele fica ligado.
 */
export function defineBetterAuthEntities(options: BetterAuthOptions): EntitySchema[] {
  const tables = getAuthTables(options);
  return Object.entries(tables).map(([model, table]) =>
    defineEntity({
      // o nome vem do `modelName`, não da chave: é por ele que o adapter procura a entidade, e é ele
      // que muda quando um modelo é renomeado (`user` → `authUser`, para não colidir com o domínio)
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
