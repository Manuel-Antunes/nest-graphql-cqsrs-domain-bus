import {
  ClientProxy,
  type ProducerSerializer,
  type ReadPacket,
  type WritePacket,
} from '@nestjs/microservices';
import { MemoryEventEnvelopeSerializer } from '../outbound/serializers/memory-event-envelope.serializer';

/** One message as it left: the pattern it went out under, and what went with it. */
export interface SentMessage {
  readonly pattern: string;
  readonly data: unknown;
}

/**
 * A `ClientProxy` that keeps what it was asked to send instead of sending it — the double upstream's
 * own suite uses, under a name that says what it does.
 *
 * It is the one place a spec can assert the *outbound* half without a broker and without the
 * in-process one either: what pattern an event went out under, what the envelope looked like, and
 * whether it went out at all.
 */
export class RecordingClient extends ClientProxy {
  readonly sent: SentMessage[] = [];

  /**
   * Takes a serializer like any other client, because that is where the message is built: a spec that
   * asserts what went on the wire has to go through the same one production does. The default is the
   * in-process one, which keeps both halves of the envelope in the value — so `sent[0].data` is
   * `{ data, metadata }`, the same pair a RabbitMQ message splits between its body and its headers.
   */
  constructor(options: { serializer?: ProducerSerializer } = {}) {
    super();
    this.initializeSerializer({ serializer: options.serializer ?? new MemoryEventEnvelopeSerializer() });
  }

  async connect(): Promise<void> {
    // Nothing to connect to: the messages stop here.
  }

  close(): void {
    this.sent.length = 0;
  }

  unwrap<T>(): T {
    return this.sent as T;
  }

  protected publish(_packet: ReadPacket, callback: (packet: WritePacket) => void): () => void {
    callback({ err: new Error('RecordingClient records events; it does not answer a send()') });
    return () => undefined;
  }

  protected async dispatchEvent<T = unknown>(packet: ReadPacket): Promise<T> {
    const serialized = (await this.serializer.serialize(packet)) as ReadPacket;
    this.sent.push({ pattern: String(serialized.pattern ?? packet.pattern), data: serialized.data });
    return undefined as T;
  }

  /** The patterns recorded so far, in order — the readable half of an assertion. */
  patterns(): string[] {
    return this.sent.map((message) => message.pattern);
  }

  clear(): void {
    this.sent.length = 0;
  }
}
