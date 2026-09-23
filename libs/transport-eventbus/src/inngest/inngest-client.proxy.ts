import type {
  ProducerSerializer,
  ReadPacket,
  WritePacket,
} from '@nestjs/microservices';
import type { Inngest } from 'inngest';
import { Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import type { InngestEventMessage } from '../outbound/serializers/inngest-event-envelope.serializer';
import type { InngestRecordOptions } from './inngest-record.builder';
import { isInngestRecord, MAX_SESSIONS } from './inngest-record.builder';

export interface InngestClientProxyOptions {
  /** The Inngest client this destination sends through — one per application, built by the caller. */
  readonly inngest: Inngest.Any;
  /**
   * **How an event becomes a message.** `InngestEventEnvelopeSerializer` is the one this library
   * ships; left out, this behaves like any plain `ClientProxy` — Nest's own `IdentitySerializer`.
   */
  readonly serializer?: ProducerSerializer;
}

/**
 * **The `ClientProxy` for Inngest: the event is the message, and the function is the binding.**
 *
 * It is the outbound half of {@link InngestStrategy}, and the mapping to the other transports is
 * close enough to be worth stating:
 *
 * | RabbitMQ | AWS | Inngest |
 * |---|---|---|
 * | the exchange | the topic | the Inngest app — one place every event is sent to |
 * | a binding | a subscription's filter policy | a function's **triggers**, resolved at boot |
 * | the routing key | the routing key attribute | the event **name**, which carries no aggregate |
 * | the AMQP headers | the message attributes | the event's `user` |
 *
 * What a caller can add per send is {@link InngestRecordBuilder}: more `user` entries, more envelope
 * metadata, more sessions, an idempotency key, a timestamp. Everything else the envelope already
 * knows.
 */
export class InngestClientProxy extends ClientProxy {
  private readonly logger = new Logger(InngestClientProxy.name);

  private readonly client: Inngest.Any;

  constructor(options: InngestClientProxyOptions) {
    super();
    this.client = options.inngest;
    if (!this.client) {
      throw new Error(
        'InngestClientProxy needs an inngest client: it is the destination, and a client without ' +
          'one would accept every publish and deliver none.',
      );
    }
    this.initializeSerializer(options);
  }

  async connect(): Promise<void> {
    // Inngest is a request over HTTPS: there is no connection to hold, and no failure to report early.
  }

  async close(): Promise<void> {
    // The client holds nothing this proxy opened.
  }

  unwrap<T = Inngest.Any>(): T {
    return this.client as T;
  }

  protected publish(
    packet: ReadPacket,
    callback: (packet: WritePacket) => void,
  ): () => void {
    callback({
      err: new Error(
        `an event triggers a function, it does not answer: nobody replies to send() on ` +
          `${String(packet.pattern)}. Use emit(), which is what the event bus does.`,
      ),
    });
    return () => undefined;
  }

  protected async dispatchEvent<T = unknown>(packet: ReadPacket): Promise<T> {
    const record = isInngestRecord(packet.data) ? packet.data : undefined;
    const options: InngestRecordOptions = record?.options ?? {};
    const message = (await this.serializer.serialize(
      record ? { ...packet, data: record.data } : packet,
    )) as InngestEventMessage;

    const sessions = {
      ...(message.meta?.sessions ?? {}),
      ...(options.sessions ?? {}),
    };
    if (Object.keys(sessions).length > MAX_SESSIONS) {
      throw new Error(
        `Inngest takes at most ${MAX_SESSIONS} sessions on one event; ${message.name} would carry ` +
          `${Object.keys(sessions).length} (${Object.keys(sessions).join(', ')}).`,
      );
    }

    await this.client.send({
      name: message.name,
      data: message.data,
      user: {
        ...message.user,
        ...(options.metadata ?? {}),
        ...(options.user ?? {}),
      },
      ...(Object.keys(sessions).length > 0 ? { meta: { sessions } } : {}),
      ...(options.idempotencyKey
        ? { id: `${message.name}:${options.idempotencyKey}` }
        : {}),
      ...(options.ts === undefined
        ? {}
        : {
            ts: options.ts instanceof Date ? options.ts.getTime() : options.ts,
          }),
    } as Parameters<Inngest.Any['send']>[0]);

    this.logger.debug(`${message.name} → inngest`);
    return undefined as T;
  }
}
