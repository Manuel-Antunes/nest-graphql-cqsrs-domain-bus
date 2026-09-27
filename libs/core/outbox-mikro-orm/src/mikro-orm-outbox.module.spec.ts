import type { DynamicModule } from '@nestjs/common';
import { OutboxInbox, OutboxModule, OutboxStorage } from '@nestjs/outbox';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DatabaseModule } from '@nestposts/database';
import {
  TestSchemaModule,
  testDatabaseConfig,
} from '@nestposts/database/testing';

import { MikroOrmOutboxModule } from './mikro-orm-outbox.module';
import { MikroOrmOutboxStore } from './mikro-orm-outbox.store';

describe('MikroOrmOutboxModule', () => {
  let module: TestingModule;

  afterEach(async () => module?.close());

  const bootstrap = async (storage: DynamicModule) => {
    module = await Test.createTestingModule({
      imports: [
        DatabaseModule.forRoot(
          testDatabaseConfig({ allowGlobalContext: true }),
        ),
        TestSchemaModule.forRoot(),
        OutboxModule.forRoot({ relay: { enabled: false } }),
        storage,
      ],
    }).compile();
    await module.init();
    return module;
  };

  it("registers its store with the application's outbox, for the messages and the inbox", async () => {
    const app = await bootstrap(
      MikroOrmOutboxModule.forRoot({ producer: 'things-api' }),
    );
    const store = app.get(MikroOrmOutboxStore);

    expect(app.get(OutboxStorage).messages).toBe(store);
    expect(app.get(OutboxStorage).inbox).toBe(store);
    expect(store.producer).toBe('things-api');
  });

  it('brings the tables it writes to, which the application never listed', async () => {
    const app = await bootstrap(
      MikroOrmOutboxModule.forRoot({ producer: 'things-api' }),
    );

    await app.get(OutboxInbox).process('tagging', 'evt-1', () => undefined);

    await expect(
      app.get(MikroOrmOutboxStore).processedBy('tagging'),
    ).resolves.toEqual([expect.objectContaining({ messageId: 'evt-1' })]);
  });

  it('takes the producer from whatever the application injects', async () => {
    const app = await bootstrap(
      MikroOrmOutboxModule.forRootAsync({
        useFactory: async () => ({ producer: 'from-config' }),
      }),
    );

    expect(app.get(MikroOrmOutboxStore).producer).toBe('from-config');
  });
});
