import { EntityManager, TransactionPropagation } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';

/**
 * **A unit of work's transaction, on MikroORM** — what `TransportEventBusModule` runs every command,
 * every ingested message and every publish nobody staged in:
 *
 * ```ts
 * TransportEventBusModule.forRoot({ identity: 'posts-api', transaction: MikroOrmUnitOfWorkTransaction })
 * ```
 *
 * `em.transactional` puts its fork in MikroORM's transaction context, so every entity manager the
 * handlers inject resolves to it while the unit runs: a repository's `flush()` writes into the
 * transaction instead of committing on its own, and what the prepare phase records — the event log,
 * the outbox — commits with it. The fork is also the handle {@link run} hands over, which is the `Tx`
 * `@nestjs/outbox` writes through and {@link MikroOrmOutboxStore} accepts. It keeps the schema of the
 * context it was forked from, which is the tenant's.
 *
 * An open transaction is joined as a savepoint, MikroORM's default, so a unit started inside one
 * commits with it — which is only right for a unit whose caller awaits it inside that transaction.
 * For one that nobody awaits there, {@link detached}.
 *
 * It satisfies `UnitOfWorkTransaction` by its shape and does not import it: this library is
 * `@nestjs/outbox` on MikroORM, and knows nothing about the bus that runs the units.
 */
@Injectable()
export class MikroOrmUnitOfWorkTransaction {
  constructor(private readonly em: EntityManager) {}

  run<T>(work: (transaction: EntityManager) => Promise<T>): Promise<T> {
    return inRequestContext(this.em, () =>
      this.em.transactional((transaction) => work(transaction)),
    );
  }

  /**
   * **A transaction of its own, even inside another one.** An `aggregate.commit()` is not awaited,
   * so the publish it sets off can outlive the transaction it was called in: as a savepoint of that
   * transaction it would release after the transaction had committed — measured, `RELEASE SAVEPOINT
   * can only be used in transaction blocks`, from a provisioning that published inside
   * `UserRepository.exclusively`.
   */
  detached(): DetachedMikroOrmTransaction {
    return new DetachedMikroOrmTransaction(this.em);
  }
}

class DetachedMikroOrmTransaction {
  constructor(private readonly em: EntityManager) {}

  run<T>(work: (transaction: EntityManager) => Promise<T>): Promise<T> {
    return inRequestContext(this.em, () =>
      this.em.transactional((transaction) => work(transaction), {
        propagation: TransactionPropagation.REQUIRES_NEW,
      }),
    );
  }

  detached(): DetachedMikroOrmTransaction {
    return this;
  }
}
