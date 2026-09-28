import { EventMessage } from '../messaging/event-message';
import type {
  Transaction,
  TransactionalMessage,
  TransactionManagerLike,
} from './transaction-manager';
import { TransactionManager } from './transaction-manager';
import {
  SimpleUnitOfWorkFactory,
  TransactionalUnitOfWorkFactory,
} from './unit-of-work-factory';

class RecordingTransactions implements TransactionManagerLike<string> {
  readonly trace: string[] = [];
  readonly told: (TransactionalMessage | undefined)[] = [];
  requiresSequentialInvocation?: boolean;
  private opened = 0;

  startTransaction(message?: TransactionalMessage): Transaction<string> {
    this.told.push(message);
    const name = `tx-${++this.opened}`;
    this.trace.push(`begin ${name}`);
    return {
      handle: name,
      commit: () => {
        this.trace.push(`commit ${name}`);
      },
      rollback: () => {
        this.trace.push(`rollback ${name}`);
      },
      run: (work) => {
        this.trace.push(`in ${name}`);
        return work();
      },
    };
  }
}

describe('a unit of work in a transaction', () => {
  it('begins it before the handler, commits it in COMMIT, and hands its handle to whoever writes in the unit', async () => {
    const transactions = new RecordingTransactions();
    const unit = new TransactionalUnitOfWorkFactory(
      TransactionManager.from(transactions),
    ).create();
    let handle: unknown;
    unit.onPrepareCommit(() => {
      handle = TransactionManager.handleOf();
    });
    unit.onAfterCommit(() => {
      transactions.trace.push('AFTER_COMMIT');
    });

    await unit.execute();

    expect(handle).toBe('tx-1');
    expect(transactions.trace).toEqual([
      'begin tx-1',
      'in tx-1',
      'in tx-1',
      'commit tx-1',
      'AFTER_COMMIT',
    ]);
  });

  it('rolls it back when any phase fails', async () => {
    const transactions = new RecordingTransactions();
    const unit = new TransactionalUnitOfWorkFactory(
      TransactionManager.from(transactions),
    ).create();
    unit.onInvocation(() => {
      throw new Error('the handler refused');
    });

    await expect(unit.execute()).rejects.toThrow('the handler refused');

    expect(transactions.trace).toEqual([
      'begin tx-1',
      'in tx-1',
      'rollback tx-1',
    ]);
  });

  it('tells the manager the message the unit handles, before the handler runs', async () => {
    const transactions = new RecordingTransactions();
    const message = EventMessage.create(
      { tenant: 'acme' },
      { metadata: { 'x-tenant': 'acme' } },
    );

    await new TransactionalUnitOfWorkFactory(
      TransactionManager.from(transactions),
    )
      .create({ message })
      .execute();

    expect(transactions.told).toEqual([message]);
  });

  it('runs each phase one action at a time when the transaction is one connection', async () => {
    const transactions = new RecordingTransactions();
    transactions.requiresSequentialInvocation = true;
    const unit = new TransactionalUnitOfWorkFactory(
      TransactionManager.from(transactions),
    ).create();
    const order: string[] = [];
    for (const action of ['a', 'b']) {
      unit.onInvocation(async () => {
        order.push(`${action} starts`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(`${action} ends`);
      });
    }

    await unit.execute();

    expect(order).toEqual(['a starts', 'a ends', 'b starts', 'b ends']);
  });

  it('gives a manager that only has the shape the behaviour of the port', () => {
    const adapted = TransactionManager.from(new RecordingTransactions());

    expect(adapted).toBeInstanceOf(TransactionManager);
    expect(adapted.requiresSequentialInvocation).toBe(false);
    expect(adapted.detached()).toBe(adapted);
  });

  it('has no transaction without a manager, and no handle', async () => {
    const unit = new SimpleUnitOfWorkFactory().create();
    let handle: unknown = 'unset';
    unit.onInvocation(() => {
      handle = TransactionManager.handleOf();
    });

    await unit.execute();

    expect(handle).toBeUndefined();
  });
});
