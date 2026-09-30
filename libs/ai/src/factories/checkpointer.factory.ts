import { FactoryProvider } from '@nestjs/common';
import { Pool } from 'pg';
import { createTenantScopedPostgresSaver } from '../checkpoint/tenant-postgres-saver';
import { CHECKPOINTER_PG_POOL } from './checkpointer-pool.factory';

export const CheckpointerFactory = {
  provide: 'CHAT_CHECKPOINTER',
  // Tenant-scoped Postgres checkpointer. Resolves the active tenant schema
  // from the same MikroORM async store (`RequestContext`) the
  // `TenantInterceptor` populates, then dispatches to a per-schema
  // `PostgresSaver` sharing the dedicated pool above. DDL for the checkpoint
  // tables is owned by the tenant migrator, so `setup()` is never called.
  //
  // No `FullState*` override is needed (unlike Redis): the Postgres saver
  // persists the full `channel_versions` map in each checkpoint row and
  // accumulates content-addressed blobs (`ON CONFLICT DO NOTHING`), so its
  // load path reassembles channels unchanged by an `interrupt()` step from the
  // prior version — the exact failure `FullStateRedisSaver` worked around.
  useFactory(pool: Pool) {
    return createTenantScopedPostgresSaver(pool);
  },
  inject: [CHECKPOINTER_PG_POOL],
} satisfies FactoryProvider;
