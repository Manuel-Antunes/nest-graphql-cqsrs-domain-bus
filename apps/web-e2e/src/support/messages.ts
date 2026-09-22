import { Broker, EXCHANGE, republished } from './broker';
import type { StoredEvent } from './database';
import { until } from './posts-api';
import { e2eTransport } from './transport';

/** One message as it went out, whatever carried it. */
export interface PublishedMessage {
  /** The event's own name, without the aggregate: `PostCreated`. */
  readonly name: string;
  /** What travelled beside the data — AMQP headers on a broker, the event's `user` on Inngest. */
  readonly headers: Record<string, string>;
}

/**
 * **What went on the wire, asked of whichever wire this run used.**
 *
 * Every transport here carries the same two things — the event and a flat map of strings — so every
 * claim this suite makes about propagation is a claim about both. What differs is only where to look:
 * a queue bound to `posts.#` and drained through the management API, or the dev server's own record
 * of the events it received. A test that could only be written against one of them would be a test of
 * the transport rather than of the system, which is why this exists.
 */
export interface Messages {
  /** Starts watching, for a transport that only keeps what somebody asked it to keep. */
  watch(pattern: string): Promise<void>;
  /** The messages of one aggregate, keyed by the event's own name. */
  of(aggregateId: string): Promise<Map<string, PublishedMessage>>;
  /** Sends a message this system already produced a second time, byte for byte. */
  redeliver(event: StoredEvent, routingKey: string, tags: string): Promise<boolean>;
}

const shortNameOf = (qualifiedName: string): string => qualifiedName.split('.')[1] ?? qualifiedName;

/**
 * RabbitMQ: a queue of this suite's own, bound to the namespace, drained through the management API.
 * Each `get` consumes what it returns, so a caller polling has to accumulate what it saw.
 */
class BrokerMessages implements Messages {
  private readonly seen = new Map<string, PublishedMessage>();

  constructor(
    private readonly broker: Broker,
    private readonly queue: string,
  ) {}

  async watch(pattern: string): Promise<void> {
    await this.broker.spyOn(this.queue, pattern);
  }

  async of(aggregateId: string): Promise<Map<string, PublishedMessage>> {
    await until(async () => {
      for (const message of await this.broker.drain(this.queue)) {
        if (message.routing_key.endsWith(aggregateId)) {
          this.seen.set(shortNameOf(message.routing_key), {
            name: shortNameOf(message.routing_key),
            headers: message.properties.headers,
          });
        }
      }
      return this.seen.size >= 2 ? this.seen : undefined;
    }, 30_000);
    return this.seen;
  }

  async redeliver(event: StoredEvent, routingKey: string, tags: string): Promise<boolean> {
    const { routed } = await this.broker.publish(republished(event, routingKey, tags));
    return routed;
  }
}

/**
 * Inngest: the dev server keeps every event it received, so there is nothing to bind and nothing to
 * drain — `/v1/events` is the wire, read after the fact.
 */
class InngestMessages implements Messages {
  constructor(private readonly baseUrl: string) {}

  async watch(): Promise<void> {
    // The dev server records everything; there is no binding to declare.
  }

  async of(aggregateId: string): Promise<Map<string, PublishedMessage>> {
    const seen = new Map<string, PublishedMessage>();
    await until(async () => {
      for (const event of await this.events()) {
        if (event.data?.['postId'] !== aggregateId) {
          continue;
        }
        seen.set(shortNameOf(event.name), {
          name: shortNameOf(event.name),
          headers: event.user ?? {},
        });
      }
      return seen.size >= 2 ? seen : undefined;
    }, 30_000);
    return seen;
  }

  /**
   * The same event again, with the same `cqrs-transport-identifier` — which is what the inbox
   * deduplicates on, and therefore what makes this the same claim the broker's republish makes.
   */
  async redeliver(event: StoredEvent, _routingKey: string, tags: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/e/dev`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: event.message_type.split('#')[0],
        data: JSON.parse(event.payload) as Record<string, unknown>,
        user: {
          'cqrs-transport-message-type': event.message_type,
          'cqrs-transport-identifier': event.identifier,
          'cqrs-transport-timestamp': new Date().toISOString(),
          'cqrs-transport-origin': 'posts-api',
          'cqrs-transport-tags': tags,
        },
      }),
    });
    return response.ok;
  }

  private async events(): Promise<
    { name: string; data?: Record<string, unknown>; user?: Record<string, string> }[]
  > {
    const response = await fetch(`${this.baseUrl}/v1/events?limit=50`);
    if (!response.ok) {
      return [];
    }
    const { data } = (await response.json()) as {
      data: { name: string; data?: Record<string, unknown>; user?: Record<string, string> }[];
    };
    return data ?? [];
  }
}

/** The one this run's transport answers with — see `support/transport.ts`. */
export const messagesOf = (queue: string): Messages =>
  e2eTransport() === 'rabbitmq'
    ? new BrokerMessages(new Broker(), queue)
    : new InngestMessages(process.env.INNGEST_BASE_URL ?? 'http://localhost:8288');

export { EXCHANGE };
