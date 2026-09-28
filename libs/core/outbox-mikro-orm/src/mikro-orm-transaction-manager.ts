import type { TransactionOptions } from '@mikro-orm/core';
import {
  EntityManager,
  TransactionContext,
  TransactionPropagation,
} from '@mikro-orm/core';
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  inRequestContext,
  TENANT_HEADER,
  Tenant,
  TenantEntityManagerService,
} from '@nestposts/database';

/** The message a unit handles, as the manager is told it: its metadata. */
export interface TransactionalMessage {
  readonly metadata: Readonly<Record<string, string>>;
}

/** One MikroORM transaction, as a unit of work holds it — `@nestposts/transport-eventbus`'s `Transaction`, by shape. */
export interface MikroOrmTransaction {
  /** The transactional fork: what `@nestjs/outbox`, the inbox and the event store write through. */
  readonly handle: EntityManager;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  /** Runs `work` in the fork's `TransactionContext`, so every `EntityManager` a handler injects resolves to it. */
  run<T>(work: () => T): T;
  /**
   * Queues `callback` for once the transaction is durable; for one that joined another as a
   * savepoint, the queue goes to that one at its commit, and is dropped if either rolls back.
   */
  afterCommit(callback: () => unknown): void;
  /** Runs the queue, once committed — what the unit that owns the transaction calls in `AFTER_COMMIT`. */
  runAfterCommit(): Promise<void>;
}

const ROLLBACK = Symbol('rollback');

/** The transactions this manager opened, by their fork: how a savepoint finds the transaction it joined. */
const opened = new WeakMap<EntityManager, OpenTransaction>();

class OpenTransaction implements MikroOrmTransaction {
  private static readonly logger = new Logger('MikroOrmTransactionManager');

  private readonly callbacks: (() => unknown)[] = [];

  constructor(
    readonly handle: EntityManager,
    private readonly decide: (commit: boolean) => void,
    private readonly finished: () => Promise<void>,
    private readonly joined: OpenTransaction | undefined,
  ) {}

  run<T>(work: () => T): T {
    return TransactionContext.create(this.handle, work);
  }

  afterCommit(callback: () => unknown): void {
    this.callbacks.push(callback);
  }

  async commit(): Promise<void> {
    this.decide(true);
    await this.finished();
    if (this.joined) {
      this.joined.callbacks.push(...this.callbacks.splice(0));
    }
  }

  async runAfterCommit(): Promise<void> {
    if (this.joined) {
      return;
    }
    for (const callback of this.callbacks.splice(0)) {
      try {
        await callback();
      } catch (error) {
        OpenTransaction.logger.error(
          'work waiting for a commit failed after the commit; the commit stands',
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async rollback(): Promise<void> {
    this.callbacks.length = 0;
    this.decide(false);
    await this.finished().catch(() => undefined);
  }
}

/**
 * **A unit of work's transaction, on MikroORM** — `@nestposts/transport-eventbus`'s
 * `TransactionManager`, which it satisfies by its shape and does not import: this library is
 * `@nestjs/outbox` on MikroORM, and knows nothing about the bus that runs the units.
 *
 * ```ts
 * TransportEventBusModule.forRoot({ identity: 'posts-api', transactionManager: MikroOrmTransactionManager })
 * ```
 *
 * ## `em.transactional`, decided later
 * A unit opens its transaction in `PRE_INVOCATION` and commits it in `COMMIT`, three phases apart;
 * MikroORM's transaction is a callback. So the callback is started and left waiting on the unit's
 * decision: {@link MikroOrmTransaction.commit} lets it return — MikroORM flushes and commits —
 * and {@link MikroOrmTransaction.rollback} makes it throw. Everything else is MikroORM's own: the fork,
 * its `TransactionContext` (entered around each phase action through `run`), and the propagation —
 * a transaction already open is joined as a savepoint, exactly as a nested `em.transactional` would,
 * which is Axon's JPA manager joining the thread's transaction.
 *
 * ## In the tenant the message names
 * The relay delivers the outbox's `local` messages outside any request, so nothing has opened the
 * tenant a message belongs to. When the unit's message names one (`x-tenant`) and no transaction is
 * open to join, the transaction is opened on that tenant's entity manager — which is where Axon's
 * multi-tenancy picks a connection too, before the handler runs. The message wins over a request
 * context, so a drain that delivers another tenant's message inside a request still writes where the
 * message belongs; a message that names no tenant is opened on the request's entity manager.
 *
 * One connection carries everything a unit writes, so its phase actions run one at a time.
 */
@Injectable()
export class MikroOrmTransactionManager {
  readonly requiresSequentialInvocation = true;

  constructor(
    protected readonly em: EntityManager,
    @Optional() protected readonly tenants?: TenantEntityManagerService,
  ) {}

  startTransaction(
    message?: TransactionalMessage,
  ): Promise<MikroOrmTransaction> {
    return this.begin(message, {});
  }

  /**
   * **A transaction of its own, even inside another one.** An `aggregate.commit()` is not awaited,
   * so the publish it sets off can outlive the transaction it was called in: as a savepoint of that
   * transaction it would release after the transaction had committed — measured, `RELEASE SAVEPOINT
   * can only be used in transaction blocks`, from a provisioning that published inside
   * `UserRepository.exclusively`.
   */
  detached(): MikroOrmTransactionManager {
    return new DetachedMikroOrmTransactionManager(this.em, this.tenants);
  }

  protected async begin(
    message: TransactionalMessage | undefined,
    options: TransactionOptions,
  ): Promise<MikroOrmTransaction> {
    const detached =
      options.propagation === TransactionPropagation.REQUIRES_NEW;
    const open = TransactionContext.getEntityManager(this.em.name);
    const joined =
      !detached && open?.isInTransaction() ? opened.get(open) : undefined;
    const base = await this.entityManagerFor(message, detached);
    return new Promise<MikroOrmTransaction>((resolve, failed) => {
      let decide: (commit: boolean) => void = () => undefined;
      const decision = new Promise<boolean>((settle) => {
        decide = settle;
      });
      let started = false;
      let finished: Promise<void> = Promise.resolve();
      finished = inRequestContext(base, () =>
        base.transactional(async (fork) => {
          started = true;
          const transaction = new OpenTransaction(
            fork,
            decide,
            () => finished,
            joined,
          );
          opened.set(fork, transaction);
          resolve(transaction);
          if (!(await decision)) {
            throw ROLLBACK;
          }
        }, options),
      ).catch((error: unknown) => {
        if (error === ROLLBACK) {
          return;
        }
        if (!started) {
          failed(error);
        }
        throw error;
      });
      void finished.catch(() => undefined);
    });
  }

  /**
   * The entity manager the transaction is opened on: the context's when a transaction is open to join,
   * the tenant's when the message names one, the request's otherwise.
   */
  private async entityManagerFor(
    message: TransactionalMessage | undefined,
    detached: boolean,
  ): Promise<EntityManager> {
    const open = TransactionContext.getEntityManager(this.em.name);
    if (!detached && open?.isInTransaction()) {
      return this.em;
    }
    const tenant = message?.metadata[TENANT_HEADER];
    if (tenant && this.tenants) {
      return this.tenants.createAndMigrateTenantEntityManager(
        Tenant.normalize(tenant),
      );
    }
    return this.em;
  }
}

class DetachedMikroOrmTransactionManager extends MikroOrmTransactionManager {
  override startTransaction(
    message?: TransactionalMessage,
  ): Promise<MikroOrmTransaction> {
    return this.begin(message, {
      propagation: TransactionPropagation.REQUIRES_NEW,
    });
  }

  override detached(): MikroOrmTransactionManager {
    return this;
  }
}
