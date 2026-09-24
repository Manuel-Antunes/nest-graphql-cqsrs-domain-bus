import type { ClientProxy } from '@nestjs/microservices';

/**
 * What a `@Publisher(...)` class has to expose: the client it publishes through.
 *
 * Upstream reads `this.client` off the decorated class, and that is the whole contract — the client
 * itself comes from `@Client({...})` or from the constructor, which is where the transport and its
 * address live. This repository keeps it: a destination is a class with a client, and what it takes are
 * the namespaces in its `@Publisher(...)`.
 */
export interface ITransportPublisherEventBus {
  readonly client: ClientProxy;
}
