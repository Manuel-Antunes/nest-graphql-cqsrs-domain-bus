import { EntityManager, TransactionPropagation } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { UnitOfWorkTransaction } from '@nestposts/cqsrs';
import { inRequestContext } from '@nestposts/database';

/**
 * **A unit of work's transaction, on MikroORM.**
 *
 * `em.transactional` puts its fork in MikroORM's transaction context, so every entity manager the
 * handlers inject resolves to it while the unit runs: a repository's `flush()` writes into the
 * transaction instead of committing on its own, and what the prepare phase records — the event log,
 * the outbox — commits with it. The fork keeps the schema of the context it was forked from, which
 * is the tenant's.
 *
 * An open transaction is joined as a savepoint, MikroORM's default, so a unit started inside one
 * commits with it — which is only right for a unit whose caller awaits it inside that transaction.
 * For one that nobody awaits there, {@link detached}.
 */
@Injectable()
export class MikroOrmUnitOfWorkTransaction extends UnitOfWorkTransaction {
  constructor(private readonly em: EntityManager) {
    super();
  }

  /**
   * **A transaction of its own, even inside another one.** An `aggregate.commit()` is not awaited,
   * so the publish it sets off can outlive the transaction it was called in: as a savepoint of that
   * transaction it would release after the transaction had committed — measured, `RELEASE SAVEPOINT
   * can only be used in transaction blocks`, from a provisioning that published inside
   * `UserRepository.exclusively`.
   */
  static detached(em: EntityManager): UnitOfWorkTransaction {
    return new DetachedTransaction(em);
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    return inRequestContext(this.em, () => this.em.transactional(() => work()));
  }
}

class DetachedTransaction extends UnitOfWorkTransaction {
  constructor(private readonly em: EntityManager) {
    super();
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    return inRequestContext(this.em, () =>
      this.em.transactional(() => work(), {
        propagation: TransactionPropagation.REQUIRES_NEW,
      }),
    );
  }
}
