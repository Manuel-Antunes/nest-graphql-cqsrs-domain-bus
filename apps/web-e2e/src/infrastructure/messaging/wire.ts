import type { RunEnvironment } from '../../environment/run-environment';
import { Poll } from '../../support/poll';
import type { StoredEvent } from '../database/event-log';
import { Broker } from './broker';
import { PublishedMessage } from './published-message';
import { TransportHeader } from './transport-header';

/**
 * **What went on the wire, asked of whichever wire this run used.**
 *
 * Every transport here carries the same two things — the event and a flat map of strings — so every
 * claim this suite makes about propagation is a claim about both. What differs is only where to look:
 * a queue bound to `posts.#` and drained through the management API, or the dev server's own record
 * of the events it received. A test that could only be written against one of them would be a test of
 * the transport rather than of the system, which is why this exists.
 */
export abstract class Wire {
  protected static readonly TIMEOUT_MS = 30_000;

  /** The one this run's transport answers with. */
  static forTransport(environment: RunEnvironment, queue: string): Wire {
    return environment.transport === 'rabbitmq'
      ? new BrokerWire(
          new Broker(
            environment.managementUrl,
            environment.brokerUser,
            environment.brokerPassword,
          ),
          queue,
        )
      : new InngestWire(environment.inngestUrl);
  }

  /** Starts watching, for a transport that only keeps what somebody asked it to keep. */
  abstract watch(pattern: string): Promise<void>;

  /** The messages of one aggregate, keyed by the event's own name. */
  abstract of(aggregateId: string): Promise<Map<string, PublishedMessage>>;

  /** Sends a message this system already produced a second time, byte for byte. */
  abstract redeliver(
    event: StoredEvent,
    routingKey: string,
    tags: string,
  ): Promise<boolean>;
}

/**
 * RabbitMQ: a queue of this suite's own, bound to the namespace, drained through the management API.
 * Each `get` consumes what it returns, so a caller polling has to accumulate what it saw.
 */
class BrokerWire extends Wire {
  private readonly seen = new Map<string, PublishedMessage>();

  constructor(
    private readonly broker: Broker,
    private readonly queue: string,
  ) {
    super();
  }

  async watch(pattern: string): Promise<void> {
    await this.broker.spyOn(this.queue, pattern);
  }

  async of(aggregateId: string): Promise<Map<string, PublishedMessage>> {
    await Poll.until(async () => {
      for (const message of await this.broker.drain(this.queue)) {
        if (message.routing_key.endsWith(aggregateId)) {
          const name = PublishedMessage.shortNameOf(message.routing_key);
          this.seen.set(
            name,
            new PublishedMessage(name, message.properties.headers),
          );
        }
      }
      return this.seen.size >= 2 ? this.seen : undefined;
    }, Wire.TIMEOUT_MS);
    return this.seen;
  }

  async redeliver(
    event: StoredEvent,
    routingKey: string,
    tags: string,
  ): Promise<boolean> {
    const { routed } = await this.broker.publish(
      BrokerWire.republished(event, routingKey, tags),
    );
    return routed;
  }

  /**
   * The message as the wire carries it: the outbox's envelope in the body, under the pattern Nest
   * reads it back by, and its headers as AMQP headers too.
   *
   * Building one by hand is what makes the redelivery test also a test of the wire format — a field
   * this suite gets wrong is a field the ingestion will not find.
   */
  private static republished(
    event: StoredEvent,
    routingKey: string,
    tags: string,
  ): unknown {
    const envelope = TransportHeader.envelopeOfRedelivery(
      event,
      routingKey,
      tags,
    );
    return {
      properties: { headers: envelope.headers },
      routing_key: routingKey,
      payload: JSON.stringify({ pattern: routingKey, data: envelope }),
      payload_encoding: 'string',
    };
  }
}

interface InngestEvent {
  name: string;
  data?: {
    payload?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
}

/**
 * Inngest: the dev server keeps every event it received, so there is nothing to bind and nothing to
 * drain — `/v1/events` is the wire, read after the fact.
 */
class InngestWire extends Wire {
  constructor(private readonly baseUrl: string) {
    super();
  }

  async watch(): Promise<void> {}

  async of(aggregateId: string): Promise<Map<string, PublishedMessage>> {
    const seen = new Map<string, PublishedMessage>();
    await Poll.until(async () => {
      for (const event of await this.events()) {
        if (event.data?.payload?.postId === aggregateId) {
          const name = PublishedMessage.shortNameOf(event.name);
          seen.set(name, new PublishedMessage(name, event.data.headers ?? {}));
        }
      }
      return seen.size >= 2 ? seen : undefined;
    }, Wire.TIMEOUT_MS);
    return seen;
  }

  /**
   * The same event again, under the same envelope id — which is what the inbox deduplicates on, and
   * therefore what makes this the same claim the broker's republish makes. It goes without Inngest's
   * own event id on purpose: with it, the dev server would drop the copy itself and the inbox would
   * never be asked.
   */
  async redeliver(
    event: StoredEvent,
    routingKey: string,
    tags: string,
  ): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/e/dev`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: event.message_type.split('#')[0],
        data: TransportHeader.envelopeOfRedelivery(event, routingKey, tags),
      }),
    });
    return response.ok;
  }

  private async events(): Promise<InngestEvent[]> {
    const response = await fetch(`${this.baseUrl}/v1/events?limit=50`);
    if (!response.ok) {
      return [];
    }
    const { data } = (await response.json()) as { data?: InngestEvent[] };
    return data ?? [];
  }
}
