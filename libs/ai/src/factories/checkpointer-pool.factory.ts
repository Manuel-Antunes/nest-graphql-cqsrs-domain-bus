import { FactoryProvider, Logger } from '@nestjs/common';
import { Pool } from 'pg';

// Dedicated Postgres pool for the LangGraph checkpointer. Intentionally
// SEPARATE from MikroORM's request-scoped pool: checkpoints are graph-internal
// resume state and must persist independently of the business transaction (a
// request that rolls back must NOT lose the checkpoint that lets the thread
// resume). Tenant scoping is achieved purely via the schema baked into each
// `PostgresSaver`'s qualified SQL — see `tenant-postgres-saver.ts`.
export const CHECKPOINTER_PG_POOL = 'CHECKPOINTER_PG_POOL';

export const CheckpointerPoolFactory = {
  provide: CHECKPOINTER_PG_POOL,
  useFactory() {
    const logger = new Logger('CheckpointerPgPool');
    const pool = new Pool({
      connectionString: process.env['POSTGRES_URL'],
      max: 10,
    });
    // Without an `error` listener, an idle-client socket blip emits an
    // unhandled 'error' on the pool and crashes the process. Log + swallow;
    // the pool replaces the broken client on the next checkout.
    pool.on('error', (err) =>
      logger.warn(
        `pg pool error: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return pool;
  },
} satisfies FactoryProvider;
