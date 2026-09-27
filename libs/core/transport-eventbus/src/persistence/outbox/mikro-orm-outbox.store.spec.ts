import type { EntityManager, MikroORM } from '@mikro-orm/core';
import { OutboxStorage } from '@nestjs/outbox';
import type { OutboxStoreHarness } from '@nestjs/outbox/testing';
import {
  outboxInboxStoreContract,
  outboxStoreContract,
} from '@nestjs/outbox/testing';
import {
  closeTestDatabase,
  tableIn,
  testDatabase,
} from '@nestposts/database/testing';

import { MikroOrmOutboxStore } from './mikro-orm-outbox.store';
import { outboxEntities } from './outbox.entities';

describe('MikroOrmOutboxStore', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await testDatabase({ entities: [...outboxEntities] });
  });

  afterAll(() => closeTestDatabase(orm));

  const emptied = async (): Promise<void> => {
    await orm.em
      .getConnection()
      .execute(
        `truncate table ${tableIn(orm, 'outbox_messages')}, ${tableIn(orm, 'outbox_dead_letters')}, ` +
          `${tableIn(orm, 'outbox_inbox')} restart identity`,
      );
  };

  const harness = async (
    producer = 'posts-api',
  ): Promise<
    OutboxStoreHarness<EntityManager> & { store: MikroOrmOutboxStore }
  > => {
    await emptied();
    return {
      store: new MikroOrmOutboxStore(orm.em, producer, new OutboxStorage()),
      transaction: (work) => orm.em.fork().transactional((em) => work(em)),
      notATransaction: orm.em.fork(),
    };
  };

  describe('the store contract', () => {
    for (const c of outboxStoreContract(() => harness(), {
      concurrent: true,
    })) {
      it(c.name, c.run);
    }
  });

  describe('the inbox contract', () => {
    for (const c of outboxInboxStoreContract(() => harness(), {
      concurrent: true,
    })) {
      it(c.name, c.run);
    }
  });

  describe('beyond the contract', () => {
    const message = (id: string, key: string | null = null) => ({
      id,
      topic: 'posts.PostCreated.p-1',
      payload: { postId: 'p-1' },
      headers: { 'cqrs-transport-identifier': id },
      key,
      createdAt: Date.now(),
      availableAt: Date.now(),
      attempts: 0,
      lastError: null,
    });

    it("never hands one producer's messages to another producer's relay", async () => {
      const { store: posts, transaction } = await harness('posts-api');
      const tagging = new MikroOrmOutboxStore(orm.em, 'tagging');

      await transaction(async (em) => {
        await posts.add(em, [message('m-1', 'p-1')]);
      });

      await expect(
        tagging.claim({
          owner: 'relay-t',
          now: Date.now(),
          leaseMs: 30_000,
          limit: 10,
        }),
      ).resolves.toEqual([]);
      await expect(tagging.stats(Date.now())).resolves.toMatchObject({
        pending: 0,
      });
      await expect(
        posts.claim({
          owner: 'relay-p',
          now: Date.now(),
          leaseMs: 30_000,
          limit: 10,
        }),
      ).resolves.toEqual([expect.objectContaining({ id: 'm-1' })]);
    });

    it('accepts the global entity manager while a transaction is open on its context', async () => {
      const { store } = await harness();

      await orm.em.fork().transactional(async (em) => {
        await store.add(em, [message('m-2')]);
      });

      await expect(store.stats(Date.now())).resolves.toMatchObject({
        pending: 1,
      });
    });

    it('keeps the inbox of each consumer apart, which one row per message could not', async () => {
      const { store } = await harness();

      await expect(
        store.recordInbox(undefined, 'tagging', 'evt-1', Date.now()),
      ).resolves.toBe(true);
      await expect(
        store.recordInbox(undefined, 'notificator', 'evt-1', Date.now()),
      ).resolves.toBe(true);
      await expect(store.processedBy('tagging')).resolves.toEqual([
        expect.objectContaining({ messageId: 'evt-1' }),
      ]);
    });
  });
});
