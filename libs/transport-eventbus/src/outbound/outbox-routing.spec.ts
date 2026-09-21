import { Injectable, type Provider } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ClientProxy } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import { MemoryClient } from '../in-memory/memory-client';
import { EVERY_NAMESPACE, Publisher } from '../decorators/publisher.decorator';
import { RecordingAddressing } from '../testing/recording.addressing';
import { RecordingClient } from '../testing/recording-client';
import { MemoryAddressing } from './addressing/memory.addressing';
import { RabbitMqAddressing } from './addressing/rabbitmq.addressing';
import { SinglePatternAddressing } from './addressing/single-pattern.addressing';
import { EventAddress } from './event-address';
import { OutboxRouting } from './outbox-routing';

@EventType({ namespace: 'posts', tags: ['postId'] })
class PostCreatedEvent {
  constructor(readonly postId: string) {}
}

@EventType({ namespace: 'tags', tags: ['tagId'] })
class TagCreatedEvent {
  constructor(readonly tagId: string) {}
}

@EventType({ namespace: 'users', tags: ['userId'] })
class UserRegisteredEvent {
  constructor(readonly userId: string) {}
}

class UndeclaredEvent {}

@Injectable()
@Publisher('posts')
class PostEventsPublisher {
  readonly client = new MemoryClient({ servers: [] });
}

const routingWith = async (providers: Provider[]): Promise<OutboxRouting> => {
  const module = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [OutboxRouting, MemoryAddressing, RabbitMqAddressing, ...providers],
  }).compile();
  await module.init();
  return module.get(OutboxRouting);
};

const routesFor = (routing: OutboxRouting, event: object) => routing.routesFor(EventAddress.of(event));

describe('OutboxRouting', () => {
  describe("the event declares its namespace, the destination declares what it takes", () => {
    it('sends the event through the destination that takes its namespace', async () => {
      const routing = await routingWith([PostEventsPublisher]);

      const routes = routesFor(routing, new PostCreatedEvent('p-1'));

      expect(routes).toHaveLength(1);
      expect(routes[0].declaration).toBe('PostEventsPublisher');
    });

    it('keeps an event of a namespace nothing takes in the process', async () => {
      const routing = await routingWith([PostEventsPublisher]);

      expect(routesFor(routing, new UserRegisteredEvent('u-1'))).toHaveLength(0);
    });

    it('keeps an event with no @EventType in the process: it has no namespace to be taken by', async () => {
      const routing = await routingWith([PostEventsPublisher]);

      expect(routesFor(routing, new UndeclaredEvent())).toHaveLength(0);
    });

    it('takes several namespaces when the destination names several', async () => {
      @Injectable()
      @Publisher(['posts', 'tags'])
      class DomainEventsPublisher {
        readonly client = new MemoryClient({ servers: [] });
      }

      const routing = await routingWith([DomainEventsPublisher]);

      expect(routesFor(routing, new PostCreatedEvent('p-1'))).toHaveLength(1);
      expect(routesFor(routing, new TagCreatedEvent('t-1'))).toHaveLength(1);
      expect(routesFor(routing, new UserRegisteredEvent('u-1'))).toHaveLength(0);
    });

    it('sends through both destinations that take one namespace: the same fact, twice on purpose', async () => {
      @Injectable()
      @Publisher('posts')
      class AuditPublisher {
        readonly client = new MemoryClient({ servers: [] });
      }

      const routing = await routingWith([PostEventsPublisher, AuditPublisher]);

      expect(
        routesFor(routing, new PostCreatedEvent('p-1'))
          .map((route) => route.declaration)
          .sort(),
      ).toEqual(['AuditPublisher', 'PostEventsPublisher']);
    });

    it('ignores a destination that takes another namespace', async () => {
      @Injectable()
      @Publisher('users')
      class UserEventsPublisher {
        readonly client = new MemoryClient({ servers: [] });
      }

      const routing = await routingWith([PostEventsPublisher, UserEventsPublisher]);

      expect(routesFor(routing, new PostCreatedEvent('p-1')).map((route) => route.declaration)).toEqual([
        'PostEventsPublisher',
      ]);
    });

    it('says what it resolved, so a spec and a log can read the topology', async () => {
      const routing = await routingWith([PostEventsPublisher]);

      expect(routing.describe()).toEqual(['PostEventsPublisher ← [posts]']);
    });
  });

  describe("EVERY_NAMESPACE: upstream's mode", () => {
    @Injectable()
    @Publisher(EVERY_NAMESPACE)
    class EverythingPublisher {
      readonly client: ClientProxy = new RecordingClient();
    }

    it('takes an event of any namespace', async () => {
      const routing = await routingWith([EverythingPublisher, RecordingAddressing]);

      expect(routesFor(routing, new PostCreatedEvent('p-1'))).toHaveLength(1);
      expect(routesFor(routing, new UserRegisteredEvent('u-1'))).toHaveLength(1);
    });

    it('takes an event with no @EventType, which nothing else can', async () => {
      const routing = await routingWith([EverythingPublisher, RecordingAddressing]);

      expect(routesFor(routing, new UndeclaredEvent())).toHaveLength(1);
    });
  });

  describe('what it refuses to do quietly', () => {
    const rejects = async (providers: Provider[], expected: RegExp) => {
      const routing = await routingWith(providers);

      expect(() => routesFor(routing, new PostCreatedEvent('p-1'))).toThrow(expected);
    };

    it('a publisher that names no namespace, which nothing would ever be routed to', async () => {
      @Injectable()
      @Publisher([])
      class SilentPublisher {
        readonly client = new MemoryClient({ servers: [] });
      }

      await rejects([SilentPublisher], /names no namespace/);
    });

    it('a publisher whose client is not a client', async () => {
      @Injectable()
      @Publisher('posts')
      class WrongPublisher {
        readonly client = 'amqp://localhost';
      }

      await rejects([WrongPublisher], /and not a ClientProxy/);
    });

    it('a client no addressing serves, which would go out with no routing key', async () => {
      @Injectable()
      @Publisher('posts')
      class UnaddressedPublisher {
        readonly client: ClientProxy = new RecordingClient();
      }

      await rejects([UnaddressedPublisher], /no ChannelAddressing serves the client/);
    });
  });

  describe('the pattern each transport addresses with', () => {
    it('is a three-segment routing key: namespace, name, aggregate', async () => {
      const routing = await routingWith([PostEventsPublisher]);
      const event = new PostCreatedEvent('p-42');

      const [route] = routesFor(routing, event);

      expect(route.addressing.pattern(EventAddress.of(event))).toBe('posts.PostCreated.p-42');
    });

    it("is upstream's single pattern for an event with no namespace", async () => {
      @Injectable()
      @Publisher(EVERY_NAMESPACE)
      class RabbitPublisher {
        readonly client: ClientProxy = new RecordingClient();
      }

      const routing = await routingWith([RabbitPublisher, SinglePatternAddressing]);
      const event = new UndeclaredEvent();

      const [route] = routesFor(routing, event);

      expect(route.addressing.pattern(EventAddress.of(event))).toBe('TRANSPORT_EVENT_BUS_PATTERN');
    });
  });
});
