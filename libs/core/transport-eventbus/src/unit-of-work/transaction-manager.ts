import { Message } from '../messaging/message';
import { ProcessingContext } from './processing-context';
import type { ProcessingLifecycle } from './processing-lifecycle';
import { ResourceKey } from './resource-key';
import type { ProcessingLifecycleInterceptor } from './unit-of-work';

/** What a transaction manager is told about the message a unit handles: its metadata. */
export interface TransactionalMessage {
  readonly metadata: Readonly<Record<string, string>>;
}

/**
 * **One database transaction, as a unit of work sees it** — Axon 5's `Transaction`, plus the two
 * things a JavaScript ORM needs that a thread-bound JPA transaction does not.
 */
export interface Transaction<Handle = unknown> {
  /**
   * The ORM's handle on the transaction — MikroORM's transactional `EntityManager`, Drizzle's `tx` —
   * which a component that writes in the unit without owning the transaction writes through: the
   * outbox, the inbox, the event store. It is `@nestjs/outbox`'s `Tx`.
   */
  readonly handle?: Handle;
  commit(): Promise<void> | void;
  /** Must be harmless after a commit: a failure in `AFTER_COMMIT` still runs the error actions. */
  rollback(): Promise<void> | void;
  /**
   * Runs `work` inside the transaction's scope — for MikroORM, its `TransactionContext` — so what a
   * handler injects writes through the transaction without being handed it. Axon needs no such thing:
   * a JPA transaction is bound to the thread.
   */
  run?<T>(work: () => T): T;
  /**
   * Queues `callback` for once what the transaction wrote is durable. A transaction that joined
   * another one hands its queue to that one when it commits — its own commit only releases a
   * savepoint — and drops it when it rolls back.
   */
  afterCommit?(callback: () => unknown): void;
  /**
   * Runs the queue — what the unit that owns the transaction calls in `AFTER_COMMIT`, outside the
   * transaction's scope. Nothing, for a transaction that joined another.
   */
  runAfterCommit?(): Promise<void> | void;
}

/**
 * **Where a unit of work's writes commit together** — Axon 5's `TransactionManager`, as a port.
 *
 * {@link attachToProcessingLifecycle} is Axon's, word for word: the transaction begins in
 * `PRE_INVOCATION`, commits in `COMMIT` and rolls back on any failure. So everything a unit writes
 * before `COMMIT` — the handler's changes, the event store's append, the outbox's rows, the inbox's
 * record, whatever the subscribing handlers write — commits together or not at all, and what runs in
 * `AFTER_COMMIT` runs once it is durable.
 *
 * This library knows no database. The application names the implementation for its ORM —
 * `TransportEventBusModule.forRoot({ transactionManager: MikroOrmTransactionManager })` — and every
 * unit the module's {@link UnitOfWorkFactory} creates runs in it.
 *
 * ## An open transaction is joined
 * A command dispatched while another unit's transaction is open — a saga reacting inside an
 * ingestion — gets a unit of its own and **joins** that transaction, which is what Axon's
 * `EntityManagerTransactionManager` does when the thread's transaction is already active. The units
 * stay two: each has its phases, its staged events, its own `executeWithResult`. {@link detached} is
 * the exception, for work nobody awaits inside the open transaction.
 */
export abstract class TransactionManager<Handle = unknown> {
  private static readonly CURRENT = new ResourceKey<Transaction>('Transaction');

  /**
   * Runs each phase action inside the transaction the unit opened, once it is open — what
   * {@link TransactionalUnitOfWorkFactory} installs on every unit.
   */
  static readonly scope: ProcessingLifecycleInterceptor =
    (action) => (context) => {
      const transaction = context.getResource(TransactionManager.CURRENT);
      return transaction?.run
        ? transaction.run(() => action(context))
        : action(context);
    };

  /** The manager itself, or one built around a manager that only has its shape. */
  static from<H>(manager: TransactionManagerLike<H>): TransactionManager<H> {
    return manager instanceof TransactionManager
      ? manager
      : new AdaptedTransactionManager(manager);
  }

  /** The transaction the context's unit runs in, once `PRE_INVOCATION` opened it. */
  static transactionOf(
    context: ProcessingContext | undefined = ProcessingContext.current(),
  ): Transaction | undefined {
    return context?.getResource(TransactionManager.CURRENT);
  }

  /**
   * **Runs `callback` once the unit's writes are durable** — which is not always the unit's own
   * `AFTER_COMMIT`. A command a saga dispatched is a unit of its own that joined the transaction of
   * the unit it was dispatched in; its `COMMIT` only releases a savepoint, and what must wait for the
   * database — a subscription hearing its events, the relay being woken — waits for the transaction
   * that owns it. A manager whose transactions cannot say falls back to the unit's `AFTER_COMMIT`.
   */
  static afterCommit(
    context: ProcessingContext,
    callback: () => unknown,
  ): void {
    const transaction = TransactionManager.transactionOf(context);
    if (transaction?.afterCommit) {
      transaction.afterCommit(callback);
      return;
    }
    context.onAfterCommit(() => callback());
  }

  /** The handle of that transaction — see {@link Transaction.handle}. */
  static handleOf<H = unknown>(
    context: ProcessingContext | undefined = ProcessingContext.current(),
  ): H | undefined {
    return TransactionManager.transactionOf(context)?.handle as H | undefined;
  }

  /**
   * Begins a transaction, or joins the one already open. `message` is the message the unit handles,
   * when it handles one: a multi-tenant manager picks the tenant's connection by its metadata — which
   * is where Axon's multi-tenancy decides it too, before the handler runs.
   */
  abstract startTransaction(
    message?: TransactionalMessage,
  ): Promise<Transaction<Handle>> | Transaction<Handle>;

  /**
   * Whether everything a unit writes goes through one connection, so its actions must run one at a
   * time — Axon's `requiresSameThreadInvocations`, which the JPA manager answers `true` to.
   */
  get requiresSequentialInvocation(): boolean {
    return false;
  }

  /**
   * The same manager, beginning a transaction of its **own** even when one is open. It is for work
   * that nobody awaits inside the open transaction — an `aggregate.commit()` outside any unit — which
   * as part of that transaction would still be running after it committed.
   */
  detached(): TransactionManager<Handle> {
    return this;
  }

  /**
   * Axon 5's default: begin in `PRE_INVOCATION`, commit in `COMMIT`, roll back on error. Once it is
   * over the unit holds it no longer, so what runs in `AFTER_COMMIT` runs outside it.
   */
  attachToProcessingLifecycle(lifecycle: ProcessingLifecycle): void {
    lifecycle.onPreInvocation(async (context) => {
      const transaction = await this.startTransaction(
        Message.fromContext(context),
      );
      context.putResource(TransactionManager.CURRENT, transaction);
      context.onAfterCommit(() => transaction.runAfterCommit?.());
      context.onCommit(async () => {
        await transaction.commit();
        context.removeResource(TransactionManager.CURRENT);
      });
      context.onError(async () => {
        await transaction.rollback();
        context.removeResource(TransactionManager.CURRENT);
      });
    });
  }
}

/**
 * **What an ORM's transaction manager has to be** — the one method a port asks for, and the defaults
 * it may leave out. An implementation that lives in a library of its own — which must not import the
 * library that runs the units — satisfies this by its shape, and {@link TransactionManager.from} gives
 * it the rest.
 */
export interface TransactionManagerLike<Handle = unknown> {
  startTransaction(
    message?: TransactionalMessage,
  ): Promise<Transaction<Handle>> | Transaction<Handle>;
  readonly requiresSequentialInvocation?: boolean;
  detached?(): TransactionManagerLike<Handle>;
}

/** A manager by shape, with {@link TransactionManager}'s behaviour around it. */
class AdaptedTransactionManager<Handle> extends TransactionManager<Handle> {
  constructor(private readonly adapted: TransactionManagerLike<Handle>) {
    super();
  }

  startTransaction(
    message?: TransactionalMessage,
  ): Promise<Transaction<Handle>> | Transaction<Handle> {
    return this.adapted.startTransaction(message);
  }

  override get requiresSequentialInvocation(): boolean {
    return this.adapted.requiresSequentialInvocation ?? false;
  }

  override detached(): TransactionManager<Handle> {
    return this.adapted.detached
      ? TransactionManager.from(this.adapted.detached())
      : this;
  }
}

/** A unit without a database: every write commits on its own, as it happens. */
export class NoTransactionManager extends TransactionManager {
  startTransaction(): Transaction {
    return { commit: () => undefined, rollback: () => undefined };
  }
}
