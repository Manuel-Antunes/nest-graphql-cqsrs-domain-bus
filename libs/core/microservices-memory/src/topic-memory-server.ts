import { MemoryServer } from '@camcima/nestjs-memory-microservices';
import type { MsPattern } from '@nestjs/microservices';
import { topicMatches } from '@nestposts/microservices-aws/topic-pattern';

/**
 * **A microservice in this process that routes like a topic exchange** — `@camcima`'s
 * [`MemoryServer`](https://github.com/camcima/nestjs-memory-microservices), which invokes the handlers
 * Nest already wrapped with guards, interceptors, pipes and filters, with the two things a broker adds
 * between a publisher and a queue:
 *
 * - **the binding is a pattern.** `MemoryServer` resolves a handler by its exact route; a message is
 *   sent under a routing key (`posts.PostCreated.<id>`) and a handler binds to a pattern
 *   (`posts.PostCreated.*`, `posts.#`). {@link emit} delivers to every handler whose pattern matches,
 *   by AMQP's rules — `*` is one segment, `#` zero or more — as each would be delivered from a queue
 *   of its own;
 * - **the message crosses a wire.** Each delivery is a JSON copy of what was emitted, as it would
 *   arrive from a socket: a `Date` that stops being a `Date`, or a field that does not survive
 *   serialization, cannot hide behind an object handed over by reference.
 *
 * ```ts
 * const server = new TopicMemoryServer();
 * const app = module.createNestMicroservice({ strategy: server });
 * await app.listen();
 *
 * await server.emit('posts.PostCreated.9f1d…', envelope);   // reaches @EventPattern('posts.#') and ('posts.PostCreated.*')
 * server.bindings();                                         // ['posts.#', 'posts.PostCreated.*'] — the in-process list_bindings
 * ```
 *
 * It knows nothing about CQRS, envelopes or `@EventType`, like the other transports beside it.
 */
export class TopicMemoryServer extends MemoryServer {
  /**
   * Delivers `data` to every handler bound to a pattern `routingKey` matches, one after the other,
   * and resolves once each has run. A routing key nothing matches is dropped, as an exchange drops
   * it — with a warning, because in process that is more often a spec's mistake than a design.
   */
  override async emit(pattern: MsPattern, data: unknown): Promise<void> {
    const routingKey = this.normalizePattern(pattern);
    const bound = this.bindings().filter((binding) =>
      topicMatches(binding, routingKey),
    );
    if (bound.length === 0) {
      this.logger.warn(
        `${routingKey} matches no binding of this service (${this.bindings().join(', ') || 'none'}): dropped`,
      );
      return;
    }
    for (const binding of bound) {
      await super.emit(binding, TopicMemoryServer.acrossTheWire(data));
    }
  }

  /** The patterns this service's handlers are bound to, sorted. */
  bindings(): string[] {
    return [...this.getHandlers().keys()].sort();
  }

  private static acrossTheWire(data: unknown): unknown {
    return data === undefined ? undefined : JSON.parse(JSON.stringify(data));
  }
}
