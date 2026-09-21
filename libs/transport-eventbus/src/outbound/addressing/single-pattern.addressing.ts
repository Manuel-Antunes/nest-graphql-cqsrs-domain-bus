import { Injectable } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { TRANSPORT_EVENT_BUS_PATTERN } from '../../constants';
import { Addressing, type ChannelAddressing } from './channel-addressing';
import type { EventAddress } from '../event-address';

/**
 * **Upstream's mode: every event under one pattern, whatever the transport.**
 *
 * It is what nestjs-transport-eventbus does — one `@EventPattern(TRANSPORT_EVENT_BUS_PATTERN)` on the
 * other side receives everything — and it is the right answer for a transport with no topic semantics
 * of its own: TCP, Redis without patterns, a Kafka topic chosen by configuration.
 *
 * ## Why it has to be asked for
 * Because it serves **any** client, so registering it by default would mean no transport could ever be
 * addressed wrongly — and being addressed wrongly is a thing worth failing over: a message that goes
 * out under a pattern nobody bound to is dropped by the broker without a line in the log. Declared,
 * it says "this service publishes the way upstream does", which is a decision rather than an accident:
 *
 * ```ts
 * @Module({
 *   providers: [...transportEventBusProviders, SinglePatternAddressing, MyPublisher],
 * })
 * export class TransportModule {}
 * ```
 */
@Injectable()
@Addressing()
export class SinglePatternAddressing implements ChannelAddressing {
  readonly transport = Symbol.for('nestposts.transport-eventbus.any');

  readonly catchAll = true;

  serves(_client: ClientProxy): boolean {
    return true;
  }

  pattern(_address: EventAddress): string {
    return TRANSPORT_EVENT_BUS_PATTERN;
  }
}
