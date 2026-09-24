import type { EntityManager } from '@mikro-orm/core';
import { MikroORM, RequestContext } from '@mikro-orm/core';
import type { IEvent } from '@nestjs/cqrs';
import { EventBus, ofType, Saga } from '@nestjs/cqrs';
import { Tenant } from '@nestposts/database';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import type { Observable } from 'rxjs';
import { EMPTY, firstValueFrom, map, take, timeout, toArray } from 'rxjs';

import { EventEnvelopeFactory } from '../outbound/event-envelope.factory';
import { MikroOrmEventLog } from '../persistence/event-log/event-log';
import {
  eventLogEntities,
  LoggedEvent,
} from '../persistence/event-log/event-log.entity';
import { CorrelatedRequestContext } from '../request-context';
import { EventTrace } from '../tracing';
import { TransportEventBusService } from '../transport-event-bus.service';
import { TransportIdentity } from '../transport-identity';
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

describe('the EventBus, event sourced', () => {
  let orm: MikroORM;
  let log: MikroOrmEventLog;
  let _envelopes: EventEnvelopeFactory;

  beforeAll(async () => {
    orm = await testDatabase({ entities: [...eventLogEntities] });
    log = new MikroOrmEventLog(orm.em);
    _envelopes = new EventEnvelopeFactory(
      TransportIdentity.named('posts-api'),
      new CorrelatedRequestContext(),
    );
  });

  afterAll(() => closeTestDatabase(orm));

  beforeEach(async () => {
    await orm.em.fork().nativeDelete(LoggedEvent, {});
  });

  /**
   * A container: the one `EventBus` there is, with the decorator pointed at it — the same two steps
   * `onApplicationBootstrap` takes, in the same order.
   */
  const busOf = (sagas: unknown[] = []) => {
    const commandBus = { execute: () => Promise.resolve() };
    const bus = new EventBus(
      commandBus as never,
      {} as never,
      { publish: () => undefined } as never,
    );
    bus.registerSagas(sagas as never[]);
    new EventSourcedEventBus({ get: () => bus } as never, log, orm.em, {
      interval: 20,
    }).onApplicationBootstrap();
    return bus;
  };

  const containerThatPublishes = () => {
    const eventBus = new EventBus({} as never, {} as never, {} as never);
    const bus = new TransportEventBusService(
      eventBus,
      { forward: () => EMPTY } as never,
      log,
    );
    return {
      eventBus: { publish: (event: object) => void bus.publish(event) },
      stop: () => undefined,
    };
  };

  const containerThatSubscribes = () => busOf();

  const settle = () => new Promise((resolve) => setTimeout(resolve, 120));

  describe('what one container writes', () => {
    it('reaches a subscriber on another container, as the real class', async () => {
      const source = containerThatSubscribes();
      const arrived = firstValueFrom(
        source.pipe(ofType(PostCompletedEvent), timeout(4000)),
      );
      await settle();

      const publishing = containerThatPublishes();
      publishing.eventBus.publish(
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
      const source = containerThatSubscribes();
      const arrived = firstValueFrom(
        source.pipe(ofType(PostCompletedEvent), timeout(4000)),
      );
      await settle();

      const publishing = containerThatPublishes();
      publishing.eventBus.publish(new UserRegisteredEvent('u-1'));
      publishing.eventBus.publish(
        new PostCompletedEvent('p-2', 'Nest', new Date()),
      );

      expect((await arrived).postId).toBe('p-2');
      publishing.stop();
    });
  });

  describe('where a new subscriber starts', () => {
    it('at the head: what happened before it subscribed is not its business', async () => {
      const publishing = containerThatPublishes();
      publishing.eventBus.publish(
        new PostCompletedEvent('before', 'Nest', new Date()),
      );
      await settle();

      const source = containerThatSubscribes();
      const arrived = firstValueFrom(
        source.pipe(ofType(PostCompletedEvent), timeout(4000)),
      );
      await settle();

      publishing.eventBus.publish(
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
      const local = subscribing.subject$.subscribe((event) => seen.push(event));
      const remote = firstValueFrom(
        subscribing.pipe(ofType(PostCompletedEvent), timeout(4000)),
      );
      await settle();

      const publishing = containerThatPublishes();
      publishing.eventBus.publish(
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
      new EventSourcedEventBus({ get: () => bus } as never, log, orm.em, {
        interval: 20,
      }).onApplicationBootstrap();

      const publishing = containerThatPublishes();
      publishing.eventBus.publish(
        new PostCompletedEvent('remote', 'Nest', new Date()),
      );
      await settle();
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
        await new MikroOrmEventLog(em).append([event]);
      });
      return em;
    };

    it('is not skipped by a subscriber that already read past its position', async () => {
      const source = containerThatSubscribes();
      const seen: string[] = [];
      source
        .pipe(ofType(PostCompletedEvent))
        .subscribe((event) => void seen.push(event.postId));
      await settle();

      const slow = await appendInOpenTransaction(
        new PostCompletedEvent('slow', 'took its position first', new Date()),
      );
      const fast = await appendInOpenTransaction(
        new PostCompletedEvent('fast', 'committed first', new Date()),
      );
      await fast.commit();

      await settle();
      await settle();

      await slow.commit();

      await settle();
      await settle();

      expect(seen).toContain('fast');
      expect(seen).toContain('slow');
    });
  });

  describe('one log, every tenant', () => {
    it('says which tenant each event was appended in', async () => {
      const source = containerThatSubscribes();
      const arrived = firstValueFrom(
        source.pipe(
          ofType(PostCompletedEvent),
          take(2),
          toArray(),
          timeout(4000),
        ),
      );
      await settle();

      for (const tenant of ['acme', 'globex']) {
        await RequestContext.create(
          orm.em.fork({ schema: Tenant.schemaOf(tenant) }),
          () =>
            log.append([
              new PostCompletedEvent(`in-${tenant}`, 'Nest', new Date()),
            ]),
        );
      }

      expect(
        (await arrived).map((event) => [event.postId, Tenant.of(event)]),
      ).toEqual([
        ['in-acme', 'acme'],
        ['in-globex', 'globex'],
      ]);
    });

    it('and which trace', async () => {
      const traceparent =
        '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01';
      const source = containerThatSubscribes();
      const arrived = firstValueFrom(
        source.pipe(ofType(PostCompletedEvent), timeout(4000)),
      );
      await settle();

      await RequestContext.create(orm.em.fork(), () =>
        log.append([
          EventTrace.stamp(new PostCompletedEvent('p-1', 'Nest', new Date()), {
            traceparent,
          }),
        ]),
      );

      expect(EventTrace.carrierOf(await arrived)).toEqual({ traceparent });
    });
  });
});
