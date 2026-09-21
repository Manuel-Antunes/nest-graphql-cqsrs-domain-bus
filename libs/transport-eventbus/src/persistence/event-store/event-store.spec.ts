import { MikroORM } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { AggregateRoot } from '@nestposts/platform/domain/shared/aggregate-root';
import { BaseEntity } from '@nestposts/platform/domain/shared/base-entity';
import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import { inRequestContext } from '@nestposts/platform/infrastructure/persistence/request-context';
import { EventSourcedRepository } from './event-sourced.repository';
import { EventStore, MikroOrmEventStore } from './event-store';
import { StoredEvent, eventStoreEntities } from './event-store.entity';

@EventType({ namespace: 'things', tags: ['thingId'] })
class ThingOpenedEvent implements DomainEvent {
  constructor(
    readonly thingId: string,
    readonly name: string,
    readonly occurredAt: Date,
  ) {}
}

@EventType({ namespace: 'things', tags: ['thingId'] })
class ThingClosedEvent implements DomainEvent {
  constructor(
    readonly thingId: string,
    readonly reason: string,
    readonly version: number,
    readonly occurredAt: Date,
  ) {}
}

class ThingId {
  constructor(readonly value: string) {}

  equals(other: unknown): boolean {
    return other instanceof ThingId && other.value === this.value;
  }
}

class Thing extends AggregateRoot(BaseEntity) {
  id!: ThingId;
  name!: string;
  version = 0;
  closed = false;

  onThingOpenedEvent(event: ThingOpenedEvent): void {
    this.id = new ThingId(event.thingId);
    this.name = event.name;
    this.version = 1;
  }

  onThingClosedEvent(event: ThingClosedEvent): void {
    this.closed = true;
    this.version = event.version;
  }

  close(reason: string, now: Date): void {
    this.apply(new ThingClosedEvent(this.id.value, reason, this.version + 1, now));
  }
}

describe('the event store', () => {
  let orm: MikroORM;
  let store: EventStore;
  let things: EventSourcedRepository<Thing>;

  const thingId = 'thing-1';
  const now = new Date('2026-09-08T12:00:00.000Z');
  const opened = (id = thingId) => new ThingOpenedEvent(id, 'a thing', now);
  const closed = (id = thingId) => new ThingClosedEvent(id, 'done', 2, now);

  beforeAll(async () => {
    orm = await MikroORM.init(
      defineConfig({
        dbName: ':memory:',
        entities: [...eventStoreEntities],
        ensureDatabase: { create: true },
      }),
    );
    store = new MikroOrmEventStore(orm.em);
    things = new EventSourcedRepository(Thing, store);
  });

  afterAll(() => orm.close(true));

  beforeEach(() => orm.em.getConnection().execute('delete from event_log'));

  const append = (events: object[], id = thingId) =>
    inRequestContext(orm.em, () => store.append(id, events));
  const read = (id = thingId) => inRequestContext(orm.em, () => store.read(id));
  const load = (id = thingId) => inRequestContext(orm.em, () => things.load(id));

  describe('the stream', () => {
    it('reads back instances of the real event classes', async () => {
      await append([opened(), closed()]);

      const history = await read();

      expect(history[0]).toBeInstanceOf(ThingOpenedEvent);
      expect(history[1]).toBeInstanceOf(ThingClosedEvent);
    });

    it('keeps the fields, dates included', async () => {
      await append([opened()]);

      const [event] = (await read()) as ThingOpenedEvent[];

      expect(event).toMatchObject({ thingId, name: 'a thing' });
      expect(event.occurredAt).toEqual(now);
    });

    it('numbers the events of a stream in order, from zero', async () => {
      await append([opened()]);
      await append([closed()]);

      const rows = await inRequestContext(orm.em, () =>
        orm.em.fork().find(StoredEvent, { streamId: thingId }, { orderBy: { sequence: 'asc' } }),
      );

      expect(rows.map((row) => [row.sequence, row.messageType])).toEqual([
        [0, 'things.ThingOpened#1.0.0'],
        [1, 'things.ThingClosed#1.0.0'],
      ]);
    });

    it('keeps one stream per aggregate', async () => {
      await append([opened()]);
      await append([opened('thing-2')], 'thing-2');

      expect(await read()).toHaveLength(1);
      expect(await read('thing-2')).toHaveLength(1);
    });

    it('reads a stream nobody wrote as no history at all', async () => {
      expect(await read('thing-404')).toEqual([]);
    });

    it('appends nothing when there is nothing to append', async () => {
      await append([]);

      expect(await read()).toEqual([]);
    });

    it('refuses to start a stream twice, so a replay cannot read the aggregate as new again', async () => {
      await append([opened()]);

      await append([opened()]);

      expect(await read()).toHaveLength(1);
    });

    it('refuses the same identifier on a later event: a stream does not hold a fact twice', async () => {
      const event = closed();
      await append([opened(), event]);

      await expect(append([event])).rejects.toThrow();
    });
  });

  describe('the aggregate it answers with', () => {
    it('is the stream, replayed', async () => {
      await append([opened(), closed()]);

      const thing = await load();

      expect(thing).toBeInstanceOf(Thing);
      expect(thing?.id.value).toBe(thingId);
      expect(thing?.version).toBe(2);
      expect(thing?.closed).toBe(true);
    });

    it('is null for an aggregate this service has never heard of', async () => {
      expect(await load('thing-404')).toBeNull();
    });

    it('takes an id as the value object the domain speaks in', async () => {
      await append([opened()]);

      const thing = await inRequestContext(orm.em, () => things.load(new ThingId(thingId)));

      expect(thing?.name).toBe('a thing');
    });

    it('appends what the aggregate decided, and only what it has not committed', async () => {
      await append([opened()]);
      const thing = (await load())!;

      thing.close('because', now);
      await inRequestContext(orm.em, () => things.save(thing));

      const history = await read();
      expect(history.map((event) => event.constructor.name)).toEqual([
        'ThingOpenedEvent',
        'ThingClosedEvent',
      ]);
    });

    it('reads its own decision back, so the next delivery decides against it', async () => {
      await append([opened()]);
      const thing = (await load())!;
      thing.close('because', now);
      await inRequestContext(orm.em, () => things.save(thing));

      expect((await load())?.closed).toBe(true);
    });
  });
});
