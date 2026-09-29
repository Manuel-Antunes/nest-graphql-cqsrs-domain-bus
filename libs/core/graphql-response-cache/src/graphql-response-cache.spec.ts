import { cacheControlDirective } from '@graphql-yoga/plugin-response-cache';
import type { Cache } from '@nestjs/cache-manager';
import { CACHE_MANAGER, CacheModule } from '@nestjs/cache-manager';
import type { INestApplicationContext } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  RedisCacheOptions,
  RedisConnection,
  RedisModule,
} from '@nestposts/redis';
import { ThrowawayRedis } from '@nestposts/redis/testing/throwaway-redis';
import { createSchema, createYoga } from 'graphql-yoga';

import { CacheManagerResponseStore } from './cache-manager-response-store';
import { GraphQLResponseCache } from './graphql-response-cache';
import { GraphQLResponseCacheModule } from './graphql-response-cache.module';

const TYPE_DEFS = /* GraphQL */ `
  ${cacheControlDirective}

  type Post @cacheControl(maxAge: 60) {
    id: ID!
    title: String!
  }

  type Profile @cacheControl(maxAge: 60, scope: PRIVATE) {
    id: ID!
    name: String!
  }

  type Query {
    post(id: ID!): Post
    slowPost(id: ID!): Post
    profile: Profile
    clock: Int!
  }

  type Mutation {
    renamePost(id: ID!, title: String!): Post!
  }
`;

describe('GraphQLResponseCache', () => {
  let redis: ThrowawayRedis;
  const contexts: INestApplicationContext[] = [];
  const titles = new Map<string, string>();
  const calls = { post: 0, slowPost: 0, profile: 0, clock: 0 };
  const slow = { entered: false, release: () => {} };

  const startService = async () => {
    @Module({
      imports: [
        RedisModule.forRoot({ url: redis.url }),
        CacheModule.registerAsync({
          isGlobal: true,
          useClass: RedisCacheOptions,
        }),
        GraphQLResponseCacheModule,
      ],
    })
    class ServiceModule {}
    const context = await NestFactory.createApplicationContext(ServiceModule, {
      logger: false,
      abortOnError: false,
    });
    contexts.push(context);
    const responseCache = context.get(GraphQLResponseCache);
    const yoga = createYoga({
      logging: false,
      plugins: [
        responseCache.plugin({
          session: (request) => request.headers.get('cookie'),
          includeExtensionMetadata: true,
        }),
      ],
      schema: createSchema({
        typeDefs: TYPE_DEFS,
        resolvers: {
          Query: {
            post: (_: unknown, { id }: { id: string }) => {
              calls.post += 1;
              return { id, title: titles.get(id) ?? `post ${id}` };
            },
            slowPost: async (_: unknown, { id }: { id: string }) => {
              calls.slowPost += 1;
              const title = titles.get(id) ?? `post ${id}`;
              slow.entered = true;
              await new Promise<void>((resolve) => {
                slow.release = resolve;
              });
              return { id, title };
            },
            profile: () => {
              calls.profile += 1;
              return { id: 'me', name: 'Ana' };
            },
            clock: () => {
              calls.clock += 1;
              return calls.clock;
            },
          },
          Mutation: {
            renamePost: (
              _: unknown,
              { id, title }: { id: string; title: string },
            ) => {
              titles.set(id, title);
              return { id, title };
            },
          },
        },
      }),
    });
    const execute = async (
      query: string,
      headers: Record<string, string> = {},
    ) => {
      const response = await yoga.fetch('http://service/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ query }),
      });
      return (await response.json()) as {
        data?: Record<string, unknown>;
        extensions?: { responseCache?: { hit: boolean } };
      };
    };
    return { context, responseCache, execute };
  };

  let service: Awaited<ReturnType<typeof startService>>;
  const ANA = { cookie: 'session=ana' };
  const BRUNO = { cookie: 'session=bruno' };

  const keys = (pattern: string) =>
    service.context.get(RedisConnection).client.keys(`*${pattern}*`);
  const stored = (count: number) =>
    vi.waitFor(async () =>
      expect(await keys('graphql-response:response:')).toHaveLength(count),
    );
  const invalidated = (typename: string, id: string) =>
    vi.waitFor(async () =>
      expect(
        await keys(`graphql-response:version:${typename}:${id}`),
      ).toHaveLength(1),
    );

  beforeAll(async () => {
    redis = await ThrowawayRedis.start();
    service = await startService();
  }, 120_000);

  afterAll(async () => {
    await Promise.all(contexts.map((context) => context.close()));
    await redis?.stop();
  });

  beforeEach(async () => {
    await service.context.get(RedisConnection).client.flushAll();
    calls.post = 0;
    calls.slowPost = 0;
    slow.entered = false;
    calls.profile = 0;
    calls.clock = 0;
    titles.clear();
  });

  it('answers a query from the cache once its type asked to be cached', async () => {
    await service.execute('{ post(id: "1") { id title } }', ANA);
    await stored(1);
    const second = await service.execute('{ post(id: "1") { id title } }', ANA);

    expect(second.data).toEqual({ post: { id: '1', title: 'post 1' } });
    expect(second.extensions?.responseCache?.hit).toBe(true);
    expect(calls.post).toBe(1);
  });

  it('never caches what did not ask to be', async () => {
    await service.execute('{ clock }', ANA);
    const second = await service.execute('{ clock }', ANA);

    expect(second.data).toEqual({ clock: 2 });
  });

  it('keeps one caller’s responses from another', async () => {
    await service.execute('{ profile { id name } }', ANA);
    await service.execute('{ profile { id name } }', BRUNO);
    await service.execute('{ post(id: "1") { id } }', ANA);
    await service.execute('{ post(id: "1") { id } }', BRUNO);

    expect(calls.profile).toBe(2);
    expect(calls.post).toBe(2);
  });

  it('keeps one tenant’s responses from another, for anonymous callers too', async () => {
    await service.execute('{ post(id: "1") { id } }', { 'x-tenant': 'acme' });
    await service.execute('{ post(id: "1") { id } }', { 'x-tenant': 'mota' });
    await stored(2);
    await service.execute('{ post(id: "1") { id } }', { 'x-tenant': 'acme' });

    expect(calls.post).toBe(2);
  });

  it('never caches what is private for a caller without a session', async () => {
    await service.execute('{ profile { id name } }');
    await service.execute('{ profile { id name } }');

    expect(calls.profile).toBe(2);
  });

  it('forgets what a mutation returned', async () => {
    await service.execute('{ post(id: "1") { id title } }', ANA);
    await stored(1);

    await service.execute(
      'mutation { renamePost(id: "1", title: "renamed") { id title } }',
      ANA,
    );
    await invalidated('Post', '1');
    const after = await service.execute('{ post(id: "1") { id title } }', ANA);

    expect(after.data).toEqual({ post: { id: '1', title: 'renamed' } });
    expect(calls.post).toBe(2);
  });

  it('forgets it in every process that shares the cache', async () => {
    const other = await startService();
    await other.execute('{ post(id: "7") { id title } }', ANA);
    await stored(1);
    await other.execute('{ post(id: "7") { id title } }', ANA);
    expect(calls.post).toBe(1);

    await service.execute(
      'mutation { renamePost(id: "7", title: "seen everywhere") { id title } }',
      ANA,
    );
    await invalidated('Post', '7');
    const after = await other.execute('{ post(id: "7") { id title } }', ANA);

    expect(after.data).toEqual({ post: { id: '7', title: 'seen everywhere' } });
    expect(calls.post).toBe(2);
  });

  it('forgets an entity, or a whole type, when told to by code', async () => {
    await service.execute('{ post(id: "1") { id } }', ANA);
    await service.execute('{ post(id: "2") { id } }', ANA);
    await stored(2);

    await service.responseCache.invalidate([{ typename: 'Post', id: '1' }]);
    await service.execute('{ post(id: "1") { id } }', ANA);
    await service.execute('{ post(id: "2") { id } }', ANA);
    expect(calls.post).toBe(3);

    await service.responseCache.invalidate([{ typename: 'Post' }]);
    await service.execute('{ post(id: "2") { id } }', ANA);
    expect(calls.post).toBe(4);
  });

  it('never stores what a query read before a change that happened while it executed', async () => {
    const reading = service.execute('{ slowPost(id: "5") { id title } }', ANA);
    await vi.waitFor(() => expect(slow.entered).toBe(true));

    await service.responseCache.invalidate([{ typename: 'Post', id: '5' }]);
    slow.release();
    await reading;
    slow.entered = false;
    const again = service.execute('{ slowPost(id: "5") { id title } }', ANA);
    await vi.waitFor(() => expect(slow.entered).toBe(true));
    slow.release();
    await again;

    expect(calls.slowPost).toBe(2);
  });

  it('caches a changed entity again once the change has settled', async () => {
    const store = new CacheManagerResponseStore(
      service.context.get<Cache>(CACHE_MANAGER),
      60_000,
      200,
    );
    const post = [{ typename: 'Post', id: '9' }];
    await store.invalidate(post);

    await store.set('settling', { data: { n: 1 } }, post, 60_000);
    await expect(store.get('settling')).resolves.toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 250));
    await store.set('settled', { data: { n: 2 } }, post, 60_000);
    await expect(store.get('settled')).resolves.toEqual({ data: { n: 2 } });
  });

  it('turns a cache that fails into a miss, and never rejects', async () => {
    const down = new Error('connection refused');
    const failing = {
      get: () => Promise.reject(down),
      mget: () => Promise.reject(down),
      set: () => Promise.reject(down),
      mset: () => Promise.reject(down),
    } as unknown as Cache;
    const store = new CacheManagerResponseStore(failing, 60_000, 0);
    const post = [{ typename: 'Post', id: '1' }];

    await expect(store.get('any')).resolves.toBeUndefined();
    await expect(
      store.set('any', { data: {} }, post, 60_000),
    ).resolves.toBeUndefined();
    await expect(store.invalidate(post)).resolves.toBeUndefined();
  });

  it('keeps the responses in the Nest cache, on the process’s Redis', async () => {
    await service.execute('{ post(id: "1") { id } }', ANA);

    await stored(1);
  });
});
