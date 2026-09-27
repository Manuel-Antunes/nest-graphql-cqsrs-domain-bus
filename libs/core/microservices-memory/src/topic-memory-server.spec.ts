import type { INestMicroservice } from '@nestjs/common';
import { Controller, Injectable } from '@nestjs/common';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';

import { TopicMemoryServer } from './topic-memory-server';

@Injectable()
class Deliveries {
  readonly received: { binding: string; data: unknown }[] = [];
}

@Controller()
class BoundController {
  constructor(private readonly deliveries: Deliveries) {}

  @EventPattern('posts.#')
  everyPost(@Payload() data: unknown): void {
    this.deliveries.received.push({ binding: 'posts.#', data });
  }

  @EventPattern('posts.PostCreated.*')
  postCreated(@Payload() data: unknown): void {
    this.deliveries.received.push({ binding: 'posts.PostCreated.*', data });
  }

  @EventPattern('users.UserRegistered.*')
  userRegistered(@Payload() data: unknown): void {
    this.deliveries.received.push({ binding: 'users.UserRegistered.*', data });
  }
}

describe('a memory server that routes like a topic exchange', () => {
  let server: TopicMemoryServer;
  let app: INestMicroservice;
  let deliveries: Deliveries;

  beforeAll(async () => {
    server = new TopicMemoryServer();
    const module = await Test.createTestingModule({
      controllers: [BoundController],
      providers: [Deliveries],
    }).compile();
    app = module.createNestMicroservice<MicroserviceOptions>({
      strategy: server,
    });
    await app.listen();
    deliveries = app.get(Deliveries);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    deliveries.received.length = 0;
  });

  it('lists the patterns its handlers are bound to', () => {
    expect(server.bindings()).toEqual([
      'posts.#',
      'posts.PostCreated.*',
      'users.UserRegistered.*',
    ]);
  });

  it('delivers a routing key to every binding it matches', async () => {
    await server.emit('posts.PostCreated.p-1', { postId: 'p-1' });

    expect(deliveries.received.map(({ binding }) => binding)).toEqual([
      'posts.#',
      'posts.PostCreated.*',
    ]);
  });

  it('delivers to one binding what only that binding matches', async () => {
    await server.emit('posts.PostUpdated.p-1', { postId: 'p-1' });

    expect(deliveries.received.map(({ binding }) => binding)).toEqual([
      'posts.#',
    ]);
  });

  it('drops a routing key nothing is bound to', async () => {
    await server.emit('orders.OrderPlaced.o-1', { orderId: 'o-1' });

    expect(deliveries.received).toEqual([]);
  });

  it('hands each binding a copy that crossed the wire', async () => {
    const sent = {
      postId: 'p-2',
      occurredAt: new Date('2026-09-08T12:00:00.000Z'),
    };

    await server.emit('posts.PostCreated.p-2', sent);

    const [first, second] = deliveries.received.map(({ data }) => data);
    expect(first).toEqual({
      postId: 'p-2',
      occurredAt: '2026-09-08T12:00:00.000Z',
    });
    expect(first).not.toBe(sent);
    expect(second).not.toBe(first);
  });
});
