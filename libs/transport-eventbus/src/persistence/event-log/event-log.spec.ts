import { MikroORM } from '@mikro-orm/core';
import { inRequestContext } from '@nestposts/database';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { MikroOrmEventLog } from './event-log';
import { eventLogEntities, LoggedEvent } from './event-log.entity';

@EventType({ namespace: 'log', tags: ['postId'] })
class PostCreatedEvent {
  constructor(
    readonly postId: string,
    readonly title: string,
  ) {}
}

@EventType({ namespace: 'log', tags: ['postId'] })
class PostUpdatedEvent {
  constructor(
    readonly postId: string,
    readonly title: string,
  ) {}
}

@EventType({ namespace: 'log' })
class NothingHappenedEvent {
  constructor(readonly note: string) {}
}

describe('the event log', () => {
  let orm: MikroORM;
  let log: MikroOrmEventLog;

  const at = <T>(work: () => Promise<T>): Promise<T> =>
    inRequestContext(orm.em, work);

  beforeAll(async () => {
    orm = await testDatabase({ entities: [...eventLogEntities] });
    log = new MikroOrmEventLog(orm.em);
  });

  afterAll(() => closeTestDatabase(orm));

  beforeEach(async () => {
    await orm.em.fork().nativeDelete(LoggedEvent, {});
  });

  describe('as an aggregate history', () => {
    it('files an event under the aggregate its tag names, and replays it in order', async () => {
      await at(() =>
        log.append([
          new PostCreatedEvent('p-1', 'Nest'),
          new PostUpdatedEvent('p-1', 'Nest 2'),
        ]),
      );

      const history = await at(() => log.readStream('p-1'));

      expect(history).toHaveLength(2);
      expect(history[0]).toBeInstanceOf(PostCreatedEvent);
      expect(history[1]).toBeInstanceOf(PostUpdatedEvent);
      expect((history[1] as PostUpdatedEvent).title).toBe('Nest 2');
    });

    it('keeps one stream out of another', async () => {
      await at(() => log.append([new PostCreatedEvent('p-1', 'one')]));
      await at(() => log.append([new PostCreatedEvent('p-2', 'two')]));

      await expect(at(() => log.readStream('p-1'))).resolves.toHaveLength(1);
      await expect(at(() => log.readStream('p-2'))).resolves.toHaveLength(1);
    });

    it('refuses a second creation of the same stream, so a replay cannot read it as starting over', async () => {
      await at(() => log.append([new PostCreatedEvent('p-1', 'first')]));
      await at(() => log.append([new PostCreatedEvent('p-1', 'again')]));

      const history = await at(() => log.readStream('p-1'));

      expect(history).toHaveLength(1);
      expect((history[0] as PostCreatedEvent).title).toBe('first');
    });
  });

  describe("as the service's own order", () => {
    it('gives every event a position, in the order they were appended', async () => {
      await at(() => log.append([new PostCreatedEvent('p-1', 'one')]));
      await at(() => log.append([new PostCreatedEvent('p-2', 'two')]));

      const records = await at(() => log.readAfter('0', 10));

      expect(
        records.map((record) => (record.event as PostCreatedEvent).postId),
      ).toEqual(['p-1', 'p-2']);
      expect(Number(records[1].position)).toBeGreaterThan(
        Number(records[0].position),
      );
    });

    it('answers 0 for an empty log, which is where a first subscriber starts', async () => {
      await expect(at(() => log.head())).resolves.toBe('0');
    });

    it('moves the head as it is written', async () => {
      await at(() => log.append([new PostCreatedEvent('p-1', 'one')]));

      await expect(at(() => log.head())).resolves.not.toBe('0');
    });

    it('carries an event that belongs to no aggregate, with a position and no stream', async () => {
      await at(() => log.append([new NothingHappenedEvent('just so')]));

      const records = await at(() => log.readAfter('0', 10));

      expect(records).toHaveLength(1);
      expect(records[0].event).toBeInstanceOf(NothingHappenedEvent);
    });
  });

  it('ignores an identifier it already has, so a redelivery costs nothing', async () => {
    const event = new PostUpdatedEvent('p-1', 'once');

    await at(() => log.append([event]));
    await at(() => log.append([event]));

    await expect(at(() => log.readAfter('0', 10))).resolves.toHaveLength(1);
  });
});
