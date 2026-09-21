import { Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { MemoryClient } from '../../in-memory/memory-client';
import { Addressing, type ChannelAddressing } from './channel-addressing';
import { TopicAddressing } from './topic.addressing';

/**
 * The addressing for the in-process transport. It keeps the same three-segment pattern RabbitMQ uses
 * — the same {@link TopicAddressing} builds both — so a spec exercises the whole outbound half, topic
 * matching included, with nothing running.
 *
 * ## Why it is a provider and not a `ChannelAddressing.NONE`
 * Because a constant does not take part in resolution by client: with the addressing chosen per
 * client, an in-memory one with no implementation registered would bring the routing table down with
 * "no ChannelAddressing serves this client" — and the right answer here is not to fail.
 */
@Injectable()
@Addressing()
export class MemoryAddressing extends TopicAddressing {
  readonly transport = MemoryClient.TRANSPORT;

  serves(client: ClientProxy): boolean {
    return client instanceof MemoryClient;
  }
}
