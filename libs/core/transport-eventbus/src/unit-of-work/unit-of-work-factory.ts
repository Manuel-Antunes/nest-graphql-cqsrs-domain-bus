import { TransactionManager } from './transaction-manager';
import type { UnitOfWorkConfiguration } from './unit-of-work';
import { UnitOfWork } from './unit-of-work';

/**
 * **Where units of work come from** — Axon 5's `UnitOfWorkFactory`. Every command, every ingested
 * message and every delivery of the outbox's `local` transport asks this for its unit, which is how
 * they all run in the application's transaction.
 *
 * ```ts
 * constructor(private readonly units: UnitOfWorkFactory) {}
 *
 * await this.units.create().executeWithResult(async () => {
 *   aggregate.doSomething();
 *   aggregate.commit();
 * });
 * ```
 */
export abstract class UnitOfWorkFactory {
  abstract create(configuration?: UnitOfWorkConfiguration): UnitOfWork;

  /** The factory whose units never join a transaction already open — see {@link TransactionManager.detached}. */
  abstract detached(): UnitOfWorkFactory;
}

/** Units with no transaction of their own. */
export class SimpleUnitOfWorkFactory extends UnitOfWorkFactory {
  create(configuration?: UnitOfWorkConfiguration): UnitOfWork {
    return new UnitOfWork(configuration);
  }

  detached(): UnitOfWorkFactory {
    return this;
  }
}

/**
 * **Units that run in a transaction** — Axon 5's `TransactionalUnitOfWorkFactory`: the delegate makes
 * the unit, the transaction manager attaches to its lifecycle, and each action runs in the
 * transaction's scope. One-connection transactions run each phase's actions one at a time.
 */
export class TransactionalUnitOfWorkFactory extends UnitOfWorkFactory {
  constructor(
    private readonly transactionManager: TransactionManager,
    private readonly delegate: UnitOfWorkFactory = new SimpleUnitOfWorkFactory(),
  ) {
    super();
  }

  create(configuration: UnitOfWorkConfiguration = {}): UnitOfWork {
    const unit = this.delegate.create({
      ...configuration,
      sequential:
        configuration.sequential ??
        this.transactionManager.requiresSequentialInvocation,
      interceptors: [
        ...(configuration.interceptors ?? []),
        TransactionManager.scope,
      ],
    });
    this.transactionManager.attachToProcessingLifecycle(unit);
    return unit;
  }

  detached(): UnitOfWorkFactory {
    return new TransactionalUnitOfWorkFactory(
      this.transactionManager.detached(),
      this.delegate,
    );
  }
}
