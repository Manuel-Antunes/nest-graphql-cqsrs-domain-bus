import type { EntityManager } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/core';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import {
  eventStoreEntities,
  MikroOrmEventStorageEngine,
  StoredEventEntitySchema,
} from '@nestposts/event-store-mikro-orm';
import { MikroOrmTransactionManager } from '@nestposts/outbox-mikro-orm';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { EventMessage } from '../messaging/event-message';
import { TransactionManager } from '../unit-of-work/transaction-manager';
import { TransactionalUnitOfWorkFactory } from '../unit-of-work/unit-of-work-factory';
import { AppendEventsTransactionRejectedError } from './append-condition';
import { EventCriteria } from './event-criteria';
import { EventSourcingRepository } from './event-sourcing.repository';
import { EventStore } from './event-store';
import { AnnotationBasedTagResolver, Tag } from './tag';

@EventType({ namespace: 'courses', tags: ['courseId'] })
class CourseOpenedEvent {
  constructor(
    readonly courseId: string,
    readonly seats: number,
  ) {}
}

@EventType({ namespace: 'courses', tags: ['courseId', 'studentId'] })
class StudentEnrolledEvent {
  constructor(
    readonly courseId: string,
    readonly studentId: string,
  ) {}
}

class Course {
  seats = 0;
  enrolled: string[] = [];

  loadFromHistory(history: object[]): void {
    for (const event of history) {
      if (event instanceof CourseOpenedEvent) {
        this.seats = event.seats;
      }
      if (event instanceof StudentEnrolledEvent) {
        this.enrolled.push(event.studentId);
      }
    }
  }
}

describe('the event store, with a dynamic consistency boundary', () => {
  let orm: MikroORM;
  let store: EventStore;
  let units: TransactionalUnitOfWorkFactory;
  let courses: EventSourcingRepository<Course>;

  const course = (id: string) =>
    EventCriteria.havingTags(new Tag('courseId', id));

  const appendElsewhere = (...events: object[]) =>
    orm.em.fork().transactional((em: EntityManager) =>
      store.engine.appendEvents(
        events.map((event) => store.storedOf(EventMessage.of(event))),
        undefined,
        em,
      ),
    );

  beforeAll(async () => {
    orm = await testDatabase({ entities: [...eventStoreEntities] });
    store = new EventStore(
      new MikroOrmEventStorageEngine(orm.em),
      new AnnotationBasedTagResolver(),
    );
    units = new TransactionalUnitOfWorkFactory(
      TransactionManager.from(new MikroOrmTransactionManager(orm.em)),
    );
    courses = new EventSourcingRepository(Course, 'courseId', store);
  });

  afterAll(() => closeTestDatabase(orm));

  beforeEach(async () => {
    await orm.em.fork().nativeDelete(StoredEventEntitySchema as never, {});
  });

  it('files every event under each of its tags, and reads back those a criteria matches', async () => {
    await appendElsewhere(
      new CourseOpenedEvent('c-1', 2),
      new StudentEnrolledEvent('c-1', 's-1'),
      new CourseOpenedEvent('c-2', 5),
    );

    const read = await store.source(course('c-1'));

    expect(read.map((message) => message.payload)).toEqual([
      new CourseOpenedEvent('c-1', 2),
      new StudentEnrolledEvent('c-1', 's-1'),
    ]);
    expect(
      (
        await store.source(
          EventCriteria.havingTags(new Tag('studentId', 's-1')).or(
            course('c-2'),
          ),
        )
      ).map((message) => message.type.qualifiedName),
    ).toEqual(['courses.StudentEnrolled', 'courses.CourseOpened']);
  });

  it('accepts a decision whose history nobody touched', async () => {
    await appendElsewhere(new CourseOpenedEvent('c-3', 2));

    await units.create().executeWithResult(async (context) => {
      await store.source(course('c-3'), context);
      await store.append(context, [
        EventMessage.of(new StudentEnrolledEvent('c-3', 's-1')),
      ]);
    });

    expect(await store.source(course('c-3'))).toHaveLength(2);
  });

  it('refuses a decision when an event its criteria match was appended after it read', async () => {
    await appendElsewhere(new CourseOpenedEvent('c-4', 1));

    const deciding = units.create().executeWithResult(async (context) => {
      await store.source(course('c-4'), context);
      await appendElsewhere(new StudentEnrolledEvent('c-4', 's-other'));
      await store.append(context, [
        EventMessage.of(new StudentEnrolledEvent('c-4', 's-1')),
      ]);
    });

    await expect(deciding).rejects.toThrow(
      AppendEventsTransactionRejectedError,
    );
    expect(
      (await store.source(course('c-4'))).map(
        (message) => (message.payload as StudentEnrolledEvent).studentId,
      ),
    ).toEqual([undefined, 's-other']);
  });

  it('is not refused by its own earlier append in the same unit', async () => {
    await appendElsewhere(new CourseOpenedEvent('c-5', 3));

    await units.create().executeWithResult(async (context) => {
      await store.source(course('c-5'), context);
      await store.append(context, [
        EventMessage.of(new StudentEnrolledEvent('c-5', 's-1')),
      ]);
      await store.append(context, [
        EventMessage.of(new StudentEnrolledEvent('c-5', 's-2')),
      ]);
    });

    expect(await store.source(course('c-5'))).toHaveLength(3);
  });

  it('loads an entity from its events once per unit of work', async () => {
    await appendElsewhere(
      new CourseOpenedEvent('c-8', 2),
      new StudentEnrolledEvent('c-8', 's-1'),
    );

    const [first, second] = await units
      .create()
      .executeWithResult(async () => [
        await courses.load('c-8'),
        await courses.load({ value: 'c-8' }),
      ]);

    expect(first).toBe(second);
    expect(first).toMatchObject({ seats: 2, enrolled: ['s-1'] });
    expect(await courses.load('never-heard-of')).toBeNull();
  });
});
