import { TransportHeader } from './transport-header';

/** One message as it went out, whatever carried it. */
export class PublishedMessage {
  constructor(
    /** The event's own name, without the aggregate: `PostCreated`. */
    readonly name: string,
    /** What travelled beside the data — AMQP headers on a broker, the event's `user` on Inngest. */
    readonly headers: Record<string, string>,
  ) {}

  static shortNameOf(qualifiedName: string): string {
    return qualifiedName.split('.')[1] ?? qualifiedName;
  }

  get origin(): string | undefined {
    return this.headers[TransportHeader.ORIGIN];
  }

  get correlationId(): string | undefined {
    return this.headers[TransportHeader.CORRELATION_ID];
  }

  get tenant(): string | undefined {
    return this.headers[TransportHeader.TENANT];
  }
}
