# microservices-memory

A Nest microservice transport that lives in the process: `@camcima/nestjs-memory-microservices`'
`MemoryServer`, which invokes the handlers Nest wrapped with guards, interceptors, pipes and filters,
extended with what a topic exchange does between a publisher and a queue. It knows nothing about CQRS,
envelopes or `@EventType`.

| | |
|---|---|
| `TopicMemoryServer` | receives: `emit(routingKey, data)` delivers to every `@EventPattern` whose pattern the key matches — `*` one segment, `#` zero or more (`topicMatches`, from `@nestposts/microservices-aws`) — each one a JSON copy, as if it had crossed a wire; `bindings()` lists the patterns |

```ts
const server = new TopicMemoryServer();
const app = await NestFactory.createMicroservice(AppModule, { strategy: server });
await app.listen();

await server.emit('posts.PostCreated.9f1d…', envelope);   // @EventPattern('posts.#') and ('posts.PostCreated.*')
```

**There is no client.** Nothing in this repository publishes to a server in its own process: an
application running with no broker (`<APP>_TRANSPORT=memory`) routes its outbox to `@nestjs/outbox`'s
own `local` transport (see `libs/core/transport-eventbus`), and this server is where it listens, and
where a suite delivers what another service would have sent — `startInProcessService` in
`@nestposts/transport-eventbus/testing` starts every service on one.
