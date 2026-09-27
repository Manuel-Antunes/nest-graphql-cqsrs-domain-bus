import { EntityManager, MikroORM } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import type { OutboxMessage } from '@nestjs/outbox';
import { Outbox, OutboxModule, OutboxTransport } from '@nestjs/outbox';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DatabaseModule } from '@nestposts/database';
import {
  TestSchemaModule,
  testDatabaseConfig,
} from '@nestposts/database/testing';

import { MikroOrmOutboxModule } from '../mikro-orm-outbox.module';
import { MikroOrmOutboxStore } from '../mikro-orm-outbox.store';
import { OutboxHousekeeping } from './outbox-housekeeping';
import { OutboxHousekeepingModule } from './outbox-housekeeping.module';

@Injectable()
class Broker extends OutboxTransport {
  static readonly published: string[] = [];

  publish(message: OutboxMessage): void {
    Broker.published.push(message.topic);
  }
}

describe('OutboxHousekeeping', () => {
  let module: TestingModule;

  beforeEach(async () => {
    Broker.published.length = 0;
    module = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRoot(
          testDatabaseConfig({ allowGlobalContext: true }),
        ),
        TestSchemaModule.forRoot(),
        OutboxModule.forRoot({
          transports: { broker: Broker },
          relay: { enabled: false, batchSize: 2 },
        }),
        MikroOrmOutboxModule.forRoot({ producer: 'things-api' }),
        OutboxHousekeepingModule.forRoot({ interval: false, batchSize: 2 }),
      ],
    }).compile();
    await module.init();
  });

  afterEach(async () => module?.close());

  const added = (...topics: string[]) =>
    module
      .get(MikroORM)
      .em.fork()
      .transactional((transaction: EntityManager) =>
        module.get(Outbox).add(
          transaction,
          topics.map((topic) => ({ topic, payload: { topic } })),
        ),
      );

  it('publishes everything that is due, a batch after another, when a schedule sweeps', async () => {
    await added('t-1', 't-2', 't-3', 't-4', 't-5');

    const sweep = await module.get(OutboxHousekeeping).sweep();

    expect(Broker.published).toEqual(['t-1', 't-2', 't-3', 't-4', 't-5']);
    expect(sweep.stats).toMatchObject({ pending: 0, deadLetters: 0 });
  });

  it('forgets what the inbox kept longer than the retention', async () => {
    const store = module.get(MikroOrmOutboxStore);
    await store.recordInbox(
      undefined,
      'tagging',
      'evt-old',
      Date.now() - 31 * 86_400_000,
    );
    await store.recordInbox(undefined, 'tagging', 'evt-new', Date.now());

    await expect(module.get(OutboxHousekeeping).sweep()).resolves.toMatchObject(
      { pruned: 1 },
    );
    await expect(store.processedBy('tagging')).resolves.toEqual([
      expect.objectContaining({ messageId: 'evt-new' }),
    ]);
  });
});
