# `@nestposts/redis`

Redis as one Nest provider: a `RedisConnection` — one node-redis client per process, connected before
anything that injects it is built, closed on shutdown — and the glue that puts the Nest cache on it.
It reads no environment: the application's `redis.config.ts` decides the options.

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [redisConfig] }),
    ConditionalModule.registerWhen(
      RedisModule.forRootAsync({
        inject: [redisConfig.KEY],
        useFactory: ({ url }: RedisConfig) => ({ url }),
      }),
      () => Boolean(redisConfig().url),
    ),
    CacheModule.registerAsync({ isGlobal: true, useClass: RedisCacheOptions }),
  ],
})
export class AppModule {}
```

`RedisModule.forRoot`/`forRootAsync` take node-redis' own `RedisClientOptions` (`url`, `socket`,
`username`…) and are global unless told otherwise. Whoever needs Redis injects `RedisConnection` and
uses `.client`.

## One client, and why node-redis

Two things stand on this client: Better Auth's secondary storage (`libs/auth`) and the Nest cache.
Keyv's Redis adapter — what `@nestjs/cache-manager` documents for a Redis store — takes a node-redis
client; Better Auth's own `@better-auth/redis-storage` takes an ioredis one. Using both packages as
they are would put two client libraries and two connections in every process, so the storage is
Better Auth's documented node-redis implementation instead, and both share this connection. Keys do
not collide: the storage writes under `better-auth:`, the cache under Keyv's `cache` namespace.

`@redis/client` is pinned to the major `@keyv/redis` depends on, so the two resolve to one copy.

Every service registers the Nest cache this way — posts-api, tagging, the notificator, the gateway and
the web's container — so `CACHE_MANAGER` is the same Redis everywhere `REDIS_URL` is set. The GraphQL
response cache (`@nestposts/graphql-response-cache`) is stored in it.

## A server that cannot be reached at boot fails the boot

node-redis' default reconnect strategy retries forever, and `connect()` stays pending while it does
— measured: after three seconds against a closed port it had emitted six errors and neither resolved
nor rejected. A process whose boot waits on that says nothing. `RedisConnection.open` refuses to
reconnect until the first connection is made, so an unreachable server rejects the boot naming the
address; once connected, a dropped connection is retried with an exponential backoff capped at three
seconds.

## Without Redis

`RedisCacheOptions` injects the connection as optional. An application that declares no
`RedisModule` — `REDIS_URL` unset, with the `ConditionalModule` above — still gets a Nest cache, in
memory, and Better Auth keeps its sessions in Postgres alone.

`ConditionalModule.registerWhen` evaluates its condition when the module FILE is imported, not when
the application boots: a spec that sets `REDIS_URL` has to import the module after it (a dynamic
`import()`), or it boots without Redis.

## Testing

`ThrowawayRedis` (`@nestposts/redis/testing/throwaway-redis`) starts a Redis of the spec's own in a
container, on a port Docker picks. Never the one on 6379: that port belongs to whatever else the
machine runs. It waits for the server's log AND for the published port to answer: on Docker Desktop
the port is forwarded a moment after Redis logs that it is ready, and a client that connects on the log
alone is refused on both loopbacks (`ECONNREFUSED`, an `AggregateError`) — often enough to fail a
spec, rarely enough to pass one first.
