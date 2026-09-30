import { RequestContext } from '@acme/database';
import type { SqlEntityManager } from '@acme/database/sql';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { Pool } from 'pg';

/**
 * Schema used when no tenant is bound to the current async scope. Mirrors the
 * `'root'` → `tenant_root` fallback in `TenantInterceptor` /
 * `TenantEntityManagerService.getTenantSchema`, so a checkpoint written outside
 * a request (e.g. an A2A executor or a unit test) lands in the same template
 * schema the rest of the stack treats as "root".
 */
export const DEFAULT_TENANT_SCHEMA = 'tenant_root';

/**
 * Resolves the Postgres schema of the tenant bound to the CURRENT async scope.
 *
 * We piggyback on the very same MikroORM async store (`RequestContext`) that
 * `TenantInterceptor` populates: the interceptor forks the EM with
 * `{ schema: 'tenant_<slug>' }` and runs the request inside
 * `RequestContext.create(...)`. Because that context propagates across awaits
 * (AsyncLocalStorage), reading the bound EM's `.schema` at checkpoint-call-time
 * — exactly when LangGraph invokes `getTuple` / `put` inside an awaited
 * `agent.stream()` — yields the active tenant. Same trick the Better-Auth
 * Kysely proxy uses to stay tenant-scoped.
 */
export function resolveTenantSchema(): string {
  const em = RequestContext.getEntityManager('pg') as
    | SqlEntityManager
    | undefined;
  const schema = em?.schema;
  return typeof schema === 'string' && schema.length > 0
    ? schema
    : DEFAULT_TENANT_SCHEMA;
}

/**
 * A tenant-scoped LangGraph checkpointer backed by Postgres.
 *
 * The stock `@langchain/langgraph-checkpoint-postgres` `PostgresSaver` already
 * fully schema-qualifies every SQL statement (`"<schema>".checkpoints`, …) from
 * a `schema` constructor option — so "forking per tenant" is just one
 * `PostgresSaver` instance per schema, all sharing a single `pg.Pool`.
 *
 * This builds a `BaseCheckpointSaver`-shaped Proxy (same pattern as
 * `AuthDatabaseKyselyFactory`) that, on every property access, resolves the
 * current tenant schema and dispatches to the matching cached `PostgresSaver`.
 * The proxy TARGET is a real `PostgresSaver` (for the default schema) so
 * `instanceof BaseCheckpointSaver`, `'x' in saver` and prototype-chain checks
 * LangGraph may perform keep working, while the `get` trap redirects the actual
 * call to the per-tenant instance.
 *
 * Note: the saver never calls `setup()`. DDL for the `checkpoints` /
 * `checkpoint_blobs` / `checkpoint_writes` tables is owned by the tenant
 * migrator (so every `tenant_<slug>` schema gets them like any other tenant
 * table), and none of the saver's runtime methods require `setup()` to have run.
 */
export function createTenantScopedPostgresSaver(
  pool: Pool,
): BaseCheckpointSaver {
  const savers = new Map<string, PostgresSaver>();

  const getSaver = (schema: string): PostgresSaver => {
    let saver = savers.get(schema);
    if (!saver) {
      saver = new PostgresSaver(pool, undefined, { schema });
      savers.set(schema, saver);
    }
    return saver;
  };

  // Real instance so feature-detection / instanceof keep working on the Proxy.
  const target = getSaver(DEFAULT_TENANT_SCHEMA);

  return new Proxy(target, {
    get(_target, prop) {
      const saver = getSaver(resolveTenantSchema());
      const value = Reflect.get(saver, prop, saver);
      return typeof value === 'function' ? value.bind(saver) : value;
    },
  });
}
