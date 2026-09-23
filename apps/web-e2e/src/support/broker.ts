import type { StoredEvent } from './database';

export const EXCHANGE = 'nestposts.events';

/**
 * The envelope as the wire carries it: the event exactly as the application wrote it in the body, and
 * everything said *about* it in the AMQP headers.
 *
 * Building one by hand is what makes the redelivery test also a test of the wire format — a header
 * this suite gets wrong is a header the ingestion will not find.
 */
export const republished = (
  event: StoredEvent,
  routingKey: string,
  tags: string,
): unknown => ({
  properties: {
    headers: {
      'cqrs-transport-message-type': event.message_type,
      'cqrs-transport-identifier': event.identifier,
      'cqrs-transport-timestamp': new Date().toISOString(),
      'cqrs-transport-origin': 'posts-api',
      'cqrs-transport-tags': tags,
    },
  },
  routing_key: routingKey,
  payload: JSON.stringify({
    pattern: routingKey,
    data: JSON.parse(event.payload),
  }),
  payload_encoding: 'string',
});

export interface SpiedMessage {
  routing_key: string;
  properties: { headers: Record<string, string> };
}

/** RabbitMQ through its management API, which is the only door that does not need an AMQP client. */
export class Broker {
  private readonly credentials: string;

  constructor(
    private readonly api = `${process.env.RABBITMQ_MANAGEMENT ?? 'http://localhost:15672'}/api`,
    user = process.env.RABBITMQ_USER ?? 'guest',
    password = process.env.RABBITMQ_PASSWORD ?? 'guest',
  ) {
    this.credentials = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  }

  async isUp(): Promise<boolean> {
    try {
      return (await this.request('GET', '/overview')).ok;
    } catch {
      return false;
    }
  }

  /**
   * DELETES the queues instead of purging them, and the difference matters: purging takes the messages
   * and leaves the BINDINGS. Bindings are durable and survive a redesign of the topology — a `posts.*`
   * from an earlier version stays hanging and makes the topology lie about the current design. Deleted,
   * the applications redeclare them on startup with exactly the bindings they declare today.
   */
  async deleteKnownQueues(): Promise<void> {
    for (const queue of [
      'nestposts.posts-api.post-completed',
      'nestposts.tagging.post-events',
    ]) {
      await this.request('DELETE', `/queues/%2F/${queue}`).catch(
        () => undefined,
      );
    }
  }

  async bindings(): Promise<string[]> {
    const response = await this.request('GET', '/bindings');
    const all = (await response.json()) as Array<{
      source: string;
      routing_key: string;
      destination: string;
    }>;
    return all
      .filter((one) => one.destination.startsWith('nestposts'))
      .map(
        (one) =>
          `${one.source || '(default)'}  ${one.routing_key}  ->  ${one.destination}`,
      );
  }

  async publish(envelope: unknown): Promise<{ routed: boolean }> {
    const response = await this.request(
      'POST',
      `/exchanges/%2F/${EXCHANGE}/publish`,
      JSON.stringify(envelope),
    );
    return (await response.json()) as { routed: boolean };
  }

  /** A queue bound to everything the namespace says, so the suite can read the headers off the wire. */
  /**
   * The queue is **durable**, which is not a preference: RabbitMQ 4 refuses a transient non-exclusive
   * one outright (`transient_nonexcl_queues` is deprecated and not permitted by default), and the
   * management API answers `400` to the declaration. It is `auto_delete` that takes it away, and the
   * broker is a container that goes away with the run anyway.
   */
  async spyOn(queue: string, routingKey: string): Promise<void> {
    await this.mustSucceed(
      this.request(
        'PUT',
        `/queues/%2F/${queue}`,
        JSON.stringify({ durable: true, auto_delete: true }),
      ),
      `declarando a fila ${queue}`,
    );
    await this.mustSucceed(
      this.request(
        'POST',
        `/bindings/%2F/e/${EXCHANGE}/q/${queue}`,
        JSON.stringify({ routing_key: routingKey }),
      ),
      `ligando ${queue} a ${EXCHANGE} por ${routingKey}`,
    );
  }

  private async mustSucceed(
    call: Promise<Response>,
    what: string,
  ): Promise<void> {
    const response = await call;
    if (!response.ok) {
      throw new Error(`${what}: ${response.status} ${await response.text()}`);
    }
  }

  /** Each `get` CONSUMES what it returns, so a caller polling has to accumulate what it saw. */
  async drain(queue: string, count = 50): Promise<SpiedMessage[]> {
    const response = await this.request(
      'POST',
      `/queues/%2F/${queue}/get`,
      JSON.stringify({ count, ackmode: 'ack_requeue_false', encoding: 'auto' }),
    );
    const messages = await response.json();
    return Array.isArray(messages) ? (messages as SpiedMessage[]) : [];
  }

  private request(
    method: string,
    path: string,
    body?: string,
  ): Promise<Response> {
    return fetch(`${this.api}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'Authorization': this.credentials,
      },
      body,
    });
  }
}
