import { defineEntity, EntityManager, MikroORM, p } from '@mikro-orm/core';
import { Module } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { DatabaseModule } from './database.module';
import { TestSchemaModule, testDatabaseConfig } from './testing/index';

class Ledger {
  id!: string;
  amount!: number;
}

class Receipt {
  id!: string;
}

const LedgerSchema = defineEntity({
  class: Ledger,
  tableName: 'ledger',
  properties: { id: p.string().primary(), amount: p.integer() },
});

const ReceiptSchema = defineEntity({
  class: Receipt,
  tableName: 'receipt',
  properties: { id: p.string().primary() },
});

@Module({ imports: [DatabaseModule.forFeature([LedgerSchema])] })
class LedgerModule {}

@Module({ imports: [DatabaseModule.forFeature([ReceiptSchema])] })
class ReceiptModule {}

const connection = (entities: unknown[] = []) =>
  DatabaseModule.forRoot(
    testDatabaseConfig(
      { entities: entities as never[], allowGlobalContext: true },
      'database_module',
    ),
  );

describe('DatabaseModule', () => {
  let module: TestingModule;

  afterEach(async () => module?.close());

  const bootstrap = async (imports: any[]) => {
    module = await Test.createTestingModule({
      imports: [...imports, TestSchemaModule.forRoot()],
    }).compile();
    await module.init();
    return module;
  };

  const write = async (app: TestingModule, id: string) => {
    const em = app.get(EntityManager).fork();
    em.persist(em.create(Ledger, { id, amount: 1 }));
    await em.flush();
    return em.fork().findOne(Ledger, { id });
  };

  it('maps what each module declared, though the connection was told about neither', async () => {
    const app = await bootstrap([connection(), LedgerModule, ReceiptModule]);
    const em = app.get(EntityManager).fork();

    await expect(write(app, 'l-1')).resolves.toMatchObject({
      id: 'l-1',
      amount: 1,
    });
    await expect(em.find(Receipt, {})).resolves.toEqual([]);
  });

  it("answers the same for a SECOND application, which Nest's own registry does not", async () => {
    await (await bootstrap([connection(), LedgerModule])).close();

    const app = await bootstrap([connection(), LedgerModule]);

    await expect(write(app, 'l-2')).resolves.toMatchObject({ id: 'l-2' });
  });

  it('keeps the entities the connection itself declares, without refusing them as duplicates', async () => {
    const app = await bootstrap([connection([LedgerSchema]), LedgerModule]);

    await expect(write(app, 'l-3')).resolves.toMatchObject({ id: 'l-3' });
  });

  it('fills entitiesTs as well, which is the list MikroORM prefers under TypeScript', async () => {
    const app = await bootstrap([connection(), LedgerModule]);
    const orm = app.get(MikroORM);

    expect(orm.config.get('entities')).toHaveLength(2);
    expect(orm.config.get('entitiesTs')).toEqual(orm.config.get('entities'));
  });
});
