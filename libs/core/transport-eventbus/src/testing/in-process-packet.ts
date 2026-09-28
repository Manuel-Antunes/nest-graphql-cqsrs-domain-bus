import type { OutboxEnvelope, OutboxMessage } from '@nestjs/outbox';

import { EventAddress } from '../outbound/event-address';

/**
 * **What a client in this process is sent** — the `toPacket` of a suite's `ClientProxyTransport`
 * around a {@link RecordingClient}, or around a client that emits on a `TopicMemoryServer`: the
 * envelope itself, under the routing key a binding is matched against.
 *
 * It is the only packet this library carries. How a message goes on a real broker — an AMQP record,
 * SNS attributes and a FIFO group, an Inngest idempotency key — is the application's own `toPacket`,
 * built from what the library exposes for it: {@link EventAddress.ofMessage}, `routingAttributesOf`
 * and the header names.
 *
 * ```ts
 * ClientProxyTransport(RecordingClient, { toPacket: InProcessPacket.of })
 * ```
 */
export class InProcessPacket {
  static of(
    message: OutboxMessage,
    envelope: OutboxEnvelope,
  ): { pattern: string; data: OutboxEnvelope } {
    return {
      pattern: EventAddress.ofMessage(message).routingKey,
      data: envelope,
    };
  }
}
