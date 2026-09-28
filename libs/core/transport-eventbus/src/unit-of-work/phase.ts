/**
 * **A moment in a unit of work's life**, ordered by `order` — Axon 5's `ProcessingLifecycle.Phase`.
 *
 * The default phases are spaced out so that an application can declare one of its own between two of
 * them (`{ name: 'audit', order: 25000 }` runs after `PREPARE_COMMIT` and before `COMMIT`). Two phases
 * with the same order run as one.
 */
export interface Phase {
  readonly name: string;
  readonly order: number;
}

/**
 * **Axon 5's default phases, with Axon 5's orders.**
 *
 * | phase | what happens there |
 * |---|---|
 * | `PRE_INVOCATION` | the transaction begins |
 * | `INVOCATION` | the handler runs; whatever it publishes is staged |
 * | `POST_INVOCATION` | whatever must see the handler's result before anything is written |
 * | `PREPARE_COMMIT` | what must be durable is written — the event store, the outbox — and the subscribing handlers are told, inside the transaction |
 * | `COMMIT` | the transaction commits |
 * | `AFTER_COMMIT` | whatever may only happen once everything is durable — the outbox's relay is woken |
 */
export const DefaultPhases = {
  PRE_INVOCATION: { name: 'PRE_INVOCATION', order: -10000 },
  INVOCATION: { name: 'INVOCATION', order: 0 },
  POST_INVOCATION: { name: 'POST_INVOCATION', order: 10000 },
  PREPARE_COMMIT: { name: 'PREPARE_COMMIT', order: 20000 },
  COMMIT: { name: 'COMMIT', order: 30000 },
  AFTER_COMMIT: { name: 'AFTER_COMMIT', order: 40000 },
} as const satisfies Record<string, Phase>;
