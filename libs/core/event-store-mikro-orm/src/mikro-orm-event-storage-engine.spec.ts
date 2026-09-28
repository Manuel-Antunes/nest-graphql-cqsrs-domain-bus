import type { EntityManager } from '@mikro-orm/core';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import { Tenant } from '@nestposts/database';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';

import {
  eventStoreEntities,
  StoredEventEntitySchema,
} from './event-store.entities';
import type { EventRecord } from './mikro-orm-event-storage-engine';
import { MikroOrmEventStorageEngine } from './mikro-orm-event-storage-engine';

let sequence = 0;

const record = (
  type: string,
  tags: string[],
  metadata: Record<string, string> = {},
): EventRecord => ({
  identifier: `evt-${++sequence}`,
  type,
  payload: { n: sequence },
  metadata,
  timestamp: new Date('2026-09-28T10:00:00.000Z'),
  tags,
});

describe('MikroOrmEventStorageEngine', () => {
  let orm: MikroORM;
  let engine: MikroOrmEventStorageEngine;

  const inTransaction = <T>(work: (em: EntityManager) => Promise<T>) =>
    orm.em.fork().transactional(work);

  beforeAll(async () => {
    orm = await testDatabase({ entities: [...eventStoreEntities] });
    engine = new MikroOrmEventStorageEngine(orm.em);
  });

  afterAll(() => closeTestDatabase(orm));

  beforeEach(async () => {
    await orm.em.fork().nativeDelete(StoredEventEntitySchema as never, {});
  });

  it('appends in order and answers the position of the last event it appended', async () => {
    const outcome = await engine.appendEvents(
      [
        record('shop.Placed#1.0.0', ['orderId=o-1']),
        record('shop.Paid#1.0.0', ['orderId=o-1']),
      ],
      undefined,
    );

    expect(outcome).toEqual({ rejected: false, last: expect.any(String) });
    expect(await engine.head()).toBe(outcome.rejected ? '' : outcome.last);
  });

  it('does not append an identifier it already has', async () => {
    const twice = record('shop.Placed#1.0.0', ['orderId=o-2']);

    await engine.appendEvents([twice], undefined);
    await engine.appendEvents([twice], undefined);

    expect(
      await engine.source([{ tags: ['orderId=o-2'], types: [] }]),
    ).toHaveLength(1);
  });

  it('reads what carries every tag of a criterion, of one of its types, or any criterion', async () => {
    await engine.appendEvents(
      [
        record('shop.Placed#1.0.0', ['orderId=o-3', 'customerId=c-1']),
        record('shop.Paid#2.0.0', ['orderId=o-3']),
        record('shop.Placed#1.0.0', ['orderId=o-4', 'customerId=c-1']),
      ],
      undefined,
    );

    const types = async (criteria: { tags: string[]; types: string[] }[]) =>
      (await engine.source(criteria)).map((event) => event.type);

    expect(
      await types([{ tags: ['orderId=o-3', 'customerId=c-1'], types: [] }]),
    ).toEqual(['shop.Placed#1.0.0']);
    expect(
      await types([{ tags: ['orderId=o-3'], types: ['shop.Paid'] }]),
    ).toEqual(['shop.Paid#2.0.0']);
    expect(
      await types([
        { tags: ['orderId=o-4'], types: [] },
        { tags: [], types: ['shop.Paid'] },
      ]),
    ).toEqual(['shop.Paid#2.0.0', 'shop.Placed#1.0.0']);
    expect(await types([])).toHaveLength(3);
  });

  it('refuses an append when an event matching its condition was appended after the marker', async () => {
    const first = await engine.appendEvents(
      [record('shop.Placed#1.0.0', ['orderId=o-5'])],
      undefined,
    );
    const marker = first.rejected ? '0' : (first.last ?? '0');
    await engine.appendEvents(
      [record('shop.Paid#1.0.0', ['orderId=o-5'])],
      undefined,
    );

    const outcome = await engine.appendEvents(
      [record('shop.Cancelled#1.0.0', ['orderId=o-5'])],
      { after: marker, criteria: [{ tags: ['orderId=o-5'], types: [] }] },
    );

    expect(outcome).toEqual({ rejected: true, conflict: expect.any(String) });
    expect(
      await engine.source([{ tags: ['orderId=o-5'], types: [] }]),
    ).toHaveLength(2);
  });

  it('serialises two appends that decide on the same tags: the second waits, sees the first, and is refused', async () => {
    const opened = await engine.appendEvents(
      [record('shop.Placed#1.0.0', ['orderId=o-6'])],
      undefined,
    );
    const marker = opened.rejected ? '0' : (opened.last ?? '0');
    const condition = {
      after: marker,
      criteria: [{ tags: ['orderId=o-6'], types: [] }],
    };
    let releaseFirst: () => void = () => undefined;
    const firstHolds = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstAppended: () => void = () => undefined;
    const firstIsIn = new Promise<void>((resolve) => {
      firstAppended = resolve;
    });

    const first = inTransaction(async (em) => {
      const outcome = await engine.appendEvents(
        [record('shop.Paid#1.0.0', ['orderId=o-6'])],
        condition,
        em,
      );
      firstAppended();
      await firstHolds;
      return outcome;
    });
    await firstIsIn;
    const second = inTransaction((em) =>
      engine.appendEvents(
        [record('shop.Cancelled#1.0.0', ['orderId=o-6'])],
        condition,
        em,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    releaseFirst();

    await expect(first).resolves.toMatchObject({ rejected: false });
    await expect(second).resolves.toMatchObject({ rejected: true });
  });

  it('gives an event read back the tenant it was appended in, when its metadata names none', async () => {
    await RequestContext.create(
      orm.em.fork({ schema: Tenant.schemaOf('acme') }),
      () =>
        engine.appendEvents(
          [record('shop.Placed#1.0.0', ['orderId=o-7'])],
          undefined,
        ),
    );
    await engine.appendEvents(
      [record('shop.Placed#1.0.0', ['orderId=o-8'], { 'x-tenant': 'globex' })],
      undefined,
    );

    const [acme] = await engine.source([{ tags: ['orderId=o-7'], types: [] }]);
    const [globex] = await engine.source([
      { tags: ['orderId=o-8'], types: [] },
    ]);

    expect(acme.metadata).toEqual({ 'x-tenant': 'acme' });
    expect(globex.metadata).toEqual({ 'x-tenant': 'globex' });
  });

  it('reads the global order after a position, asking again for the gaps it was given', async () => {
    const all = await engine.appendEvents(
      [
        record('shop.Placed#1.0.0', ['orderId=o-9']),
        record('shop.Paid#1.0.0', ['orderId=o-9']),
        record('shop.Shipped#1.0.0', ['orderId=o-9']),
      ],
      undefined,
    );
    const last = BigInt(all.rejected ? '0' : (all.last ?? '0'));

    const after = await engine.readAfter((last - 1n).toString(), 10, [
      (last - 2n).toString(),
    ]);

    expect(after.map((event) => event.type)).toEqual([
      'shop.Placed#1.0.0',
      'shop.Shipped#1.0.0',
    ]);
  });
});
