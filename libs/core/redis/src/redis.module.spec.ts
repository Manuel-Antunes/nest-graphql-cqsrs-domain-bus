import type { Cache } from '@nestjs/cache-manager';
import { CACHE_MANAGER, CacheModule } from '@nestjs/cache-manager';
import type { INestApplicationContext, ModuleMetadata } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { RedisModule } from './redis.module';
import { RedisCacheOptions } from './redis-cache.options';
import { RedisConnection } from './redis-connection';
import { ThrowawayRedis } from './testing/throwaway-redis';

describe('RedisModule', () => {
  let redis: ThrowawayRedis;
  const contexts: INestApplicationContext[] = [];

  const boot = async (imports: ModuleMetadata['imports']) => {
    @Module({ imports })
    class SpecModule {}
    const context = await NestFactory.createApplicationContext(SpecModule, {
      logger: false,
      abortOnError: false,
    });
    contexts.push(context);
    return context;
  };

  beforeAll(async () => {
    redis = await ThrowawayRedis.start();
  }, 120_000);

  afterAll(async () => {
    await Promise.all(contexts.map((context) => context.close()));
    await redis?.stop();
  });

  it('provides one connected client, and closes it with the application', async () => {
    const context = await boot([
      RedisModule.forRootAsync({ useFactory: () => ({ url: redis.url }) }),
    ]);
    const { client } = context.get(RedisConnection);

    await client.set('spec:ping', 'pong');
    await expect(client.get('spec:ping')).resolves.toBe('pong');

    await context.close();
    expect(client.isOpen).toBe(false);
  });

  it('refuses to boot against a server it cannot reach, instead of waiting for it', async () => {
    const started = Date.now();

    await expect(
      boot([RedisModule.forRoot({ url: 'redis://127.0.0.1:1' })]),
    ).rejects.toThrow(/ECONNREFUSED/);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('keeps the Nest cache in that Redis, under its own namespace', async () => {
    const context = await boot([
      RedisModule.forRoot({ url: redis.url }),
      CacheModule.registerAsync({ useClass: RedisCacheOptions }),
    ]);
    const cache = context.get<Cache>(CACHE_MANAGER);
    const { client } = context.get(RedisConnection);

    await cache.set('organization', { slug: 'acme' }, 60_000);

    await expect(cache.get('organization')).resolves.toEqual({ slug: 'acme' });
    const keys = await client.keys(`*${RedisCacheOptions.NAMESPACE}*`);
    expect(keys.some((key) => key.includes('organization'))).toBe(true);
  });

  it('leaves the Nest cache in memory when the application declares no Redis', async () => {
    const context = await boot([
      CacheModule.registerAsync({ useClass: RedisCacheOptions }),
    ]);
    const cache = context.get<Cache>(CACHE_MANAGER);

    await cache.set('local-only', 'here', 60_000);

    await expect(cache.get('local-only')).resolves.toBe('here');
  });
});
