import type { EntityManager } from '@mikro-orm/core';
import { defineEntity, MikroORM, p } from '@mikro-orm/core';
import type { TenantEntityManagerService } from '@nestposts/database';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';

import type { MikroOrmTransaction } from './mikro-orm-transaction-manager';
import { MikroOrmTransactionManager } from './mikro-orm-transaction-manager';

class Note {
  constructor(readonly id: string) {}
}

const NoteSchema = defineEntity({
  class: Note,
  tableName: 'notes',
  properties: { id: p.string().primary() },
});

describe('MikroOrmTransactionManager', () => {
  let orm: MikroORM;
  let manager: MikroOrmTransactionManager;

  const write = (transaction: MikroOrmTransaction, id: string) =>
    transaction.run(() => transaction.handle.persist(new Note(id)).flush());

  const notes = async () =>
    (await orm.em.fork().find(Note, {}, { orderBy: { id: 'asc' } })).map(
      (note) => note.id,
    );

  beforeAll(async () => {
    orm = await testDatabase({ entities: [NoteSchema] });
    manager = new MikroOrmTransactionManager(orm.em);
  });

  afterAll(() => closeTestDatabase(orm));

  beforeEach(async () => {
    await orm.em.fork().nativeDelete(Note, {});
  });

  it('commits what was written through it, and only when told', async () => {
    const transaction = await manager.startTransaction();
    await write(transaction, 'n-1');

    expect(await notes()).toEqual([]);
    await transaction.commit();
    expect(await notes()).toEqual(['n-1']);
  });

  it('discards it when rolled back, and a rollback after the commit changes nothing', async () => {
    const discarded = await manager.startTransaction();
    await write(discarded, 'n-2');
    await discarded.rollback();

    const committed = await manager.startTransaction();
    await write(committed, 'n-3');
    await committed.commit();
    await committed.rollback();

    expect(await notes()).toEqual(['n-3']);
  });

  it('joins a transaction already open as a savepoint: the inner one rolls back alone', async () => {
    const outer = await manager.startTransaction();
    await write(outer, 'outer');

    await outer.run(async () => {
      const inner = await manager.startTransaction();
      await write(inner, 'inner');
      await inner.rollback();
    });
    await outer.commit();

    expect(await notes()).toEqual(['outer']);
  });

  it('commits a detached transaction on its own, whatever the open one does', async () => {
    const outer = await manager.startTransaction();
    await write(outer, 'outer');

    await outer.run(async () => {
      const detached = await manager.detached().startTransaction();
      await write(detached, 'detached');
      await detached.commit();
    });
    await outer.rollback();

    expect(await notes()).toEqual(['detached']);
  });

  it('opens the transaction in the tenant the message names, when none is open to join', async () => {
    const opened: string[] = [];
    const tenants = {
      createAndMigrateTenantEntityManager: async (tenant: string) => {
        opened.push(tenant);
        return orm.em.fork();
      },
    } as unknown as TenantEntityManagerService;
    const multiTenant = new MikroOrmTransactionManager(orm.em, tenants);

    const transaction = await multiTenant.startTransaction({
      metadata: { 'x-tenant': 'Acme' },
    });
    await transaction.rollback();

    expect(opened).toEqual(['acme']);
  });

  it('asks for its phases one at a time: one connection carries everything', () => {
    expect(manager.requiresSequentialInvocation).toBe(true);
  });

  it('hands over the transactional fork as the handle the outbox writes through', async () => {
    const transaction = await manager.startTransaction();

    expect((transaction.handle as EntityManager).isInTransaction()).toBe(true);
    await transaction.rollback();
  });

  it('runs what waits for the commit after the commit, and never after a rollback', async () => {
    const trace: string[] = [];
    const committed = await manager.startTransaction();
    committed.afterCommit(() => trace.push('committed'));
    const rolledBack = await manager.startTransaction();
    rolledBack.afterCommit(() => trace.push('rolled back'));

    await rolledBack.rollback();
    await rolledBack.runAfterCommit();
    await committed.commit();
    expect(trace).toEqual([]);
    await committed.runAfterCommit();
    expect(trace).toEqual(['committed']);
  });

  it('hands what a joined transaction waits for to the one it joined, which runs it at its own commit', async () => {
    const trace: string[] = [];
    const outer = await manager.startTransaction();
    outer.afterCommit(() => trace.push('outer'));

    await outer.run(async () => {
      const kept = await manager.startTransaction();
      kept.afterCommit(() => trace.push('inner, kept'));
      await kept.commit();
      await kept.runAfterCommit();
      const discarded = await manager.startTransaction();
      discarded.afterCommit(() => trace.push('inner, rolled back'));
      await discarded.rollback();
    });
    expect(trace).toEqual([]);

    await outer.commit();
    await outer.runAfterCommit();
    expect(trace).toEqual(['outer', 'inner, kept']);
  });
});
