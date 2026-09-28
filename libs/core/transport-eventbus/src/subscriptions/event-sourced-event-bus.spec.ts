import type { EntityManager } from '@mikro-orm/core';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import type { IEvent } from '@nestjs/cqrs';
import { EventBus, ofType, Saga } from '@nestjs/cqrs';
import { Tenant } from '@nestposts/database';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import {
  eventStoreEntities,
  MikroOrmEventStorageEngine,
  StoredEventEntitySchema,
} from '@nestposts/event-store-mikro-orm';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import type { Observable } from 'rxjs';
import { firstValueFrom, map, take, timeout, toArray } from 'rxjs';

import { EventStore } from '../eventsourcing/event-store';
import { AnnotationBasedTagResolver } from '../eventsourcing/tag';
import { EventMessage } from '../messaging/event-message';
import { EventTrace } from '../tracing';
import { EventSourcedEventBus } from './event-sourced-event-bus';

@EventType({ namespace: 'feed', tags: ['postId'] })
class PostCompletedEvent {
  constructor(
    readonly postId: string,
    readonly title: string,
    readonly occurredAt: Date,
  ) {}
}

@EventType({ namespace: 'feed', tags: ['userId'] })
class UserRegisteredEvent {
  constructor(readonly userId: string) {}
}

const storeOn = (em: EntityManager) =>
  new EventStore(
    new MikroOrmEventStorageEngine(em),
    new AnnotationBasedTagResolver(),
  );

class HeadWatchingEventStore extends EventStore {
  readonly reading: Promise<void>;
  private headRead: () => void = () => undefined;

  constructor(em: EntityManager) {
    super(new MikroOrmEventStorageEngine(em), new AnnotationBasedTagResolver());
    this.reading = new Promise((resolve) => {
      this.headRead = resolve;
    });
  }

  override async head(): Promise<string> {
    const head = await super.head();
    this.headRead();
    return head;
  }
}

describe('the EventBus, event sourced', () => {
  let orm: MikroORM;
  let log: EventStore;

  beforeAll(async () => {
    orm = await testDatabase({ entities: [...eventStoreEntities] });
    log = storeOn(orm.em);
  });

  afterAll(() => closeTestDatabase(orm));

  beforeEach(async () => {
    await orm.em.fork().nativeDelete(StoredEventEntitySchema as never, {});
  });

  /**
   * A container: the one `EventBus` there is, with the decorator pointed at it — the same two steps
   * `onApplicationBootstrap` takes, in the same order.
   */
  const busOf = (reader: EventStore, sagas: unknown[] = []) => {
    const commandBus = { execute: () => Promise.resolve() };
    const bus = new EventBus(
      commandBus as never,
      {} as never,
      { publish: () => undefined } as never,
    );
    bus.registerSagas(sagas as never[]);
    new EventSourcedEventBus({ get: () => bus } as never, reader, {
      interval: 20,
    }).onApplicationBootstrap();
    return bus;
  };

  const containerThatPublishes = () => ({
    eventBus: {
      publish: (event: object) =>
        RequestContext.create(orm.em.fork(), () =>
          log.append(undefined, [EventMessage.of(event)]),
        ),
    },
    stop: () => undefined,
  });

  const containerThatSubscribes = () => {
    const reader = new HeadWatchingEventStore(orm.em);
    return { bus: busOf(reader), reading: reader.reading };
  };

  const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

  describe('what one container writes', () => {
    it('reaches a subscriber on another container, as the real class', async () => {
      const subscribing = containerThatSubscribes();
      const arrived = firstValueFrom(
        subscribing.bus.pipe(ofType(PostCompletedEvent), timeout(4000)),
      );
      await subscribing.reading;

      const publishing = containerThatPublishes();
      await publishing.eventBus.publish(
        new PostCompletedEvent(
          'p-1',
          'Nest',
          new Date('2026-09-08T12:00:00.000Z'),
        ),
      );

      const event = await arrived;
      publishing.stop();

      expect(event).toBeInstanceOf(PostCompletedEvent);
      expect(event.postId).toBe('p-1');
      expect(event.title).toBe('Nest');
      expect(event.occurredAt).toBeInstanceOf(Date);
    });

    it('delivers only the types the subscription asked for', async () => {
      const subscribing = containerThatSubscribes();
      const arrived = firstValueFrom(
        subscribing.bus.pipe(ofType(PostCompletedEvent), timeout(4000)),
      );
      await subscribing.reading;

      const publishing = containerThatPublishes();
      await publishing.eventBus.publish(new UserRegisteredEvent('u-1'));
      await publishing.eventBus.publish(
        new PostCompletedEvent('p-2', 'Nest', new Date()),
      );

      expect((await arrived).postId).toBe('p-2');
      publishing.stop();
    });
  });

  describe('where a new subscriber starts', () => {
    it('at the head: what happened before it subscribed is not its business', async () => {
      const publishing = containerThatPublishes();
      await publishing.eventBus.publish(
        new PostCompletedEvent('before', 'Nest', new Date()),
      );

      const subscribing = containerThatSubscribes();
      const arrived = firstValueFrom(
        subscribing.bus.pipe(ofType(PostCompletedEvent), timeout(4000)),
      );
      await subscribing.reading;

      await publishing.eventBus.publish(
        new PostCompletedEvent('after', 'Nest', new Date()),
      );

      expect((await arrived).postId).toBe('after');
      publishing.stop();
    });
  });

  describe('the three readers of a bus are not the same reader', () => {
    it('keeps subject$ on this process, which is where @EventsHandler is bound', async () => {
      const subscribing = containerThatSubscribes();
      const seen: unknown[] = [];
      const local = subscribing.bus.subject$.subscribe((event) =>
        seen.push(event),
      );
      const remote = firstValueFrom(
        subscribing.bus.pipe(ofType(PostCompletedEvent), timeout(4000)),
      );
      await subscribing.reading;

      const publishing = containerThatPublishes();
      await publishing.eventBus.publish(
        new PostCompletedEvent('p-3', 'Nest', new Date()),
      );

      await remote;
      local.unsubscribe();
      publishing.stop();

      expect(seen).toEqual([]);
    });

    it('keeps a saga on this process, so scaling out does not dispatch the command twice', async () => {
      const executed: unknown[] = [];
      const commandBus = {
        execute: (command: unknown) => (
          executed.push(command), Promise.resolve()
        ),
      };

      class Sagas {
        @Saga()
        onCompleted = (events$: Observable<IEvent>) =>
          events$.pipe(
            ofType(PostCompletedEvent),
            map((event) => ({
              dispatchedFor: (event as PostCompletedEvent).postId,
            })),
          );
      }

      const instance = new Sagas();
      const bus = new EventBus(
        commandBus as never,
        {} as never,
        { publish: () => undefined } as never,
      );
      bus.registerSagas([
        {
          metatype: Sagas,
          instance,
          isDependencyTreeStatic: () => true,
        } as never,
      ]);
      new EventSourcedEventBus({ get: () => bus } as never, log, {
        interval: 20,
      }).onApplicationBootstrap();

      const publishing = containerThatPublishes();
      await publishing.eventBus.publish(
        new PostCompletedEvent('remote', 'Nest', new Date()),
      );
      await settle();

      expect(executed).toEqual([]);

      bus.publish(new PostCompletedEvent('local', 'Nest', new Date()));
      await settle();

      expect(executed).toEqual([{ dispatchedFor: 'local' }]);
      publishing.stop();
    });
  });
  describe('an event whose transaction commits late', () => {
    const appendInOpenTransaction = async (
      event: object,
    ): Promise<EntityManager> => {
      let em!: EntityManager;
      await RequestContext.create(orm.em, async () => {
        em = RequestContext.getEntityManager() as EntityManager;
        await em.begin();
        await log.engine.appendEvents(
          [log.storedOf(EventMessage.of(event))],
          undefined,
          em,
        );
      });
      return em;
    };

    it('is not skipped by a subscriber that already read past its position', async () => {
      const subscribing = containerThatSubscribes();
      const seen: string[] = [];
      const subscription = subscribing.bus
        .pipe(ofType(PostCompletedEvent))
        .subscribe((event) => void seen.push(event.postId));
      await subscribing.reading;

      const slow = await appendInOpenTransaction(
        new PostCompletedEvent('slow', 'took its position first', new Date()),
      );
      const fast = await appendInOpenTransaction(
        new PostCompletedEvent('fast', 'committed first', new Date()),
      );
      await fast.commit();
      await vi.waitFor(() => expect(seen).toEqual(['fast']), {
        timeout: 4000,
      });

      await slow.commit();

      await vi.waitFor(() => expect(seen).toEqual(['fast', 'slow']), {
        timeout: 4000,
      });
      subscription.unsubscribe();
    });
  });

  describe('one store, every tenant', () => {
    it('says which tenant each event was appended in, in its metadata', async () => {
      const subscribing = containerThatSubscribes();
      const arrived = firstValueFrom(
        subscribing.bus.pipe(
          ofType(PostCompletedEvent),
          take(2),
          toArray(),
          timeout(4000),
        ),
      );
      await subscribing.reading;

      for (const tenant of ['acme', 'globex']) {
        await RequestContext.create(
          orm.em.fork({ schema: Tenant.schemaOf(tenant) }),
          () =>
            log.append(undefined, [
              EventMessage.of(
                new PostCompletedEvent(`in-${tenant}`, 'Nest', new Date()),
              ),
            ]),
        );
      }

      expect(
        (await arrived).map((event) => [
          event.postId,
          EventMessage.of(event).metadata['x-tenant'],
        ]),
      ).toEqual([
        ['in-acme', 'acme'],
        ['in-globex', 'globex'],
      ]);
    });

    it('and which trace', async () => {
      const traceparent =
        '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      const subscribing = containerThatSubscribes();
      const arrived = firstValueFrom(
        subscribing.bus.pipe(ofType(PostCompletedEvent), timeout(4000)),
      );
      await subscribing.reading;

      const event = new PostCompletedEvent('p-1', 'Nest', new Date());
      EventMessage.of(event);
      EventTrace.stamp(event, { traceparent });
      await RequestContext.create(orm.em.fork(), () =>
        log.append(undefined, [EventMessage.of(event)]),
      );

      expect(EventTrace.carrierOf(await arrived)).toEqual({ traceparent });
    });
  });
});
