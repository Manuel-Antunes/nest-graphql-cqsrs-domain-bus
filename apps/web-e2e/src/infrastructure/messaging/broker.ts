import { Poll } from '../../support/poll';

export interface SpiedMessage {
  routing_key: string;
  properties: { headers: Record<string, string> };
}

/** RabbitMQ through its management API, which is the only door that does not need an AMQP client. */
export class Broker {
  static readonly EXCHANGE = 'nestposts.events';

  private readonly credentials: string;
  private readonly api: string;

  constructor(managementUrl: string, user: string, password: string) {
    this.api = `${managementUrl}/api`;
    this.credentials = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  }

  async publish(envelope: unknown): Promise<{ routed: boolean }> {
    const response = await this.request(
      'POST',
      `/exchanges/%2F/${Broker.EXCHANGE}/publish`,
      JSON.stringify(envelope),
    );
    return (await response.json()) as { routed: boolean };
  }

  /**
   * A queue bound to everything the namespace says, so the suite can read the headers off the wire.
   *
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
      `declaring the queue ${queue}`,
    );
    await this.mustSucceed(
      this.request(
        'POST',
        `/bindings/%2F/e/${Broker.EXCHANGE}/q/${queue}`,
        JSON.stringify({ routing_key: routingKey }),
      ),
      `binding ${queue} to ${Broker.EXCHANGE} by ${routingKey}`,
    );
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

  findIn(
    queue: string,
    predicate: (message: SpiedMessage) => boolean,
    timeoutMs: number,
  ): Promise<SpiedMessage | undefined> {
    return Poll.until(
      async () => (await this.drain(queue)).find(predicate),
      timeoutMs,
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
