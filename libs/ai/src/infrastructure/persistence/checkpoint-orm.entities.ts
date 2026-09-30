import { defineEntity, TENANT_SCHEMA } from '@nestposts/database';

/**
 * MikroORM mirrors of the LangGraph checkpointer tables that `createTenantScopedPostgresSaver`
 * (in `@acme/ai`) reads and writes.
 *
 * These are **not** application entities — no domain class, no repository, and nothing
 * loads them through the EM. `PostgresSaver` owns every runtime query; these exist only
 * so the schema diff knows the tables are supposed to be there.
 *
 * They previously lived in the tenant config's `schemaGenerator.skipTables`, which does
 * not hold: `skipTables` is applied on only two of the diff's three sides. It filters the
 * metadata (`getOrderedMetadata`) and the live introspection (`prepareSchemaForComparison`
 * forwards it to `DatabaseSchema.create`), but `Migrator.runMigrations` writes the snapshot
 * with `skipTables = undefined` and `getSchemaFromSnapshot` reads it back verbatim. So a
 * `migration:up` baked these tables into the snapshot, and the next `migration:create`
 * diffed them against a metadata side that correctly excluded them — emitting
 * `drop table checkpoints` (and blobs/writes) on every single run.
 *
 * Declaring them makes all three sides agree, which stays stable no matter which command
 * wrote the snapshot last.
 *
 * The columns below MUST mirror `PostgresSaver`'s schema exactly — the DDL is pinned by
 * `Migration20260619120000_AddLanggraphCheckpointTables`, and the saver never calls
 * `setup()`. If LangGraph ever changes its schema, the next diff surfaces it as churn,
 * which is the loud failure we want rather than a silent drift.
 */
export const CheckpointsSchema = defineEntity({
  name: 'LanggraphCheckpoint',
  tableName: 'checkpoints',
  schema: TENANT_SCHEMA,
  properties(properties) {
    return {
      threadId: properties.text().name('thread_id').primary(),
      checkpointNs: properties
        .text()
        .name('checkpoint_ns')
        .primary()
        .default(''),
      checkpointId: properties.text().name('checkpoint_id').primary(),
      parentCheckpointId: properties
        .text()
        .name('parent_checkpoint_id')
        .nullable(),
      type: properties.text().name('type').nullable(),
      checkpoint: properties.json().name('checkpoint'),
      metadata: properties.json().name('metadata').default('{}'),
    };
  },
});

export const CheckpointBlobsSchema = defineEntity({
  name: 'LanggraphCheckpointBlob',
  tableName: 'checkpoint_blobs',
  schema: TENANT_SCHEMA,
  properties(properties) {
    return {
      threadId: properties.text().name('thread_id').primary(),
      checkpointNs: properties
        .text()
        .name('checkpoint_ns')
        .primary()
        .default(''),
      channel: properties.text().name('channel').primary(),
      version: properties.text().name('version').primary(),
      type: properties.text().name('type'),
      blob: properties.blob().name('blob').nullable(),
    };
  },
});

export const CheckpointWritesSchema = defineEntity({
  name: 'LanggraphCheckpointWrite',
  tableName: 'checkpoint_writes',
  schema: TENANT_SCHEMA,
  properties(properties) {
    return {
      threadId: properties.text().name('thread_id').primary(),
      checkpointNs: properties
        .text()
        .name('checkpoint_ns')
        .primary()
        .default(''),
      checkpointId: properties.text().name('checkpoint_id').primary(),
      taskId: properties.text().name('task_id').primary(),
      idx: properties.integer().name('idx').primary(),
      channel: properties.text().name('channel'),
      type: properties.text().name('type').nullable(),
      blob: properties.blob().name('blob'),
    };
  },
});

export const CHECKPOINT_ENTITIES = [
  CheckpointsSchema,
  CheckpointBlobsSchema,
  CheckpointWritesSchema,
];
