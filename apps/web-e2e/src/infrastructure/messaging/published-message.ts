import { TransportHeader } from './transport-header';

/** One message as it went out, whatever carried it. */
export class PublishedMessage {
  constructor(
    /** The event's own name, without the aggregate: `PostCreated`. */
    readonly name: string,
    /** What travelled beside the payload — the envelope's headers, which a broker also carries as AMQP headers. */
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
