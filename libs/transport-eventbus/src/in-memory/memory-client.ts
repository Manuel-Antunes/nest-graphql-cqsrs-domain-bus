import type { MemoryServer } from '@camcima/nestjs-memory-microservices';
import { MEMORY_TRANSPORT } from '@camcima/nestjs-memory-microservices';
import type {
  ConsumerDeserializer,
  ProducerSerializer,
  ReadPacket,
  WritePacket,
} from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';
import { topicMatches } from '@nestposts/microservices-aws/topic-pattern';

import { MemoryEventEnvelopeDeserializer } from '../inbound/deserializers/memory-event-envelope.deserializer';

export interface MemoryClientOptions {
  /**
   * The services this client publishes to. A live array or a thunk, because in a test the client is
   * built by the publishing application's container and the server it talks to may only exist after.
   */
  readonly servers: readonly MemoryServer[] | (() => readonly MemoryServer[]);
  readonly serializer?: ProducerSerializer;
  readonly deserializer?: ConsumerDeserializer;
}

/**
 * **The emitting half of the transport that is not there**, over
 * [`MemoryServer`](https://github.com/camcima/nestjs-memory-microservices) — which is the receiving
 * half, and not ours: it registers the handlers Nest already wrapped with guards, interceptors, pipes
 * and filters, and invokes them in process. A test that goes through it is testing the microservice,
 * not a method.
 *
 * ## What this class adds, and why it has to exist
 * Two things that package does not have, both of which a topic exchange does:
 *
 * - **a `ClientProxy`**, so the outbound half — the routing table, the addressing, the serializer — is
 *   exercised exactly as it is in production, instead of a spec calling `server.emit` by hand;
 * - **pattern matching**. `MemoryServer` resolves a handler by the exact route, while a routing key is
 *   `posts.PostCreated.<postId>` and the binding is `posts.PostCreated.*`. Matching them is what a
 *   broker does, so it is done here, against the patterns the server says it has
 *   (`getHandlers()`), which is also what makes "this queue is bound to that" observable in a spec.
 *
 * ## It goes through the wire, not around it
 * Every message is serialized, `JSON.parse(JSON.stringify(...))`'d and deserialized, exactly as it
 * would be through a socket and the server's own deserializer. That is the point of the round trip: a
 * `Date` that stops being a `Date`, or a payload that only survives when its length is a multiple of
 * three, cannot hide behind an in-process shortcut.
 */
export class MemoryClient extends ClientProxy {
  static readonly TRANSPORT = MEMORY_TRANSPORT;

  private readonly servers: () => readonly MemoryServer[];

  /**
   * Its own, because `ClientProxy.deserializer` is the one that reads a *response* — and what this
   * needs is the one a server reads a delivery with, which is the same class the real transports are
   * given in their options.
   */
  private readonly consumer: ConsumerDeserializer;

  constructor(options: MemoryClientOptions) {
    super();
    this.servers =
      typeof options.servers === 'function'
        ? options.servers
        : () => options.servers as readonly MemoryServer[];
    this.consumer =
      options.deserializer ?? new MemoryEventEnvelopeDeserializer();
    this.initializeSerializer(options);
  }

  async connect(): Promise<void> {
    // There is nothing to connect to: the services are objects in this process.
  }

  close(): void {
    // And nothing to close.
  }

  unwrap<T>(): T {
    return this.servers() as T;
  }

  /** The patterns every reachable service has bound — the in-process `list_bindings`. */
  bindings(): string[] {
    return this.servers()
      .flatMap((server) => [...server.getHandlers().keys()])
      .sort();
  }

  protected publish(
    _packet: ReadPacket,
    callback: (packet: WritePacket) => void,
  ): () => void {
    callback({
      err: new Error(
        'the in-process transport carries events only; there is nobody to answer a send()',
      ),
    });
    return () => undefined;
  }

  protected async dispatchEvent<T = unknown>(packet: ReadPacket): Promise<T> {
    const routingKey = String(packet.pattern);
    const wire = JSON.parse(
      JSON.stringify(await this.serializer.serialize(packet)),
    ) as unknown;

    for (const server of this.servers()) {
      for (const pattern of server.getHandlers().keys()) {
        if (!topicMatches(pattern, routingKey)) {
          continue;
        }
        const incoming = await this.consumer.deserialize(wire, {
          channel: pattern,
        });
        await server.emit(pattern, incoming.data);
      }
    }
    return undefined as T;
  }
}
