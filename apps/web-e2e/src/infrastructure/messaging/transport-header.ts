import type { StoredEvent } from '../database/event-log';

export class TransportHeader {
  static readonly MESSAGE_TYPE = 'cqrs-transport-message-type';
  static readonly TIMESTAMP = 'cqrs-transport-timestamp';
  static readonly ORIGIN = 'cqrs-transport-origin';
  static readonly TAGS = 'cqrs-transport-tags';
  static readonly CORRELATION_ID = 'cqrs-transport-correlation-id';
  static readonly TENANT = 'x-tenant';

  static ofRedelivery(
    event: StoredEvent,
    tags: string,
  ): Record<string, string> {
    return {
      [TransportHeader.MESSAGE_TYPE]: event.message_type,
      [TransportHeader.TIMESTAMP]: new Date().toISOString(),
      [TransportHeader.ORIGIN]: 'posts-api',
      [TransportHeader.TAGS]: tags,
    };
  }

  static envelopeOfRedelivery(
    event: StoredEvent,
    tags: string,
  ): Record<string, unknown> {
    return {
      id: event.identifier,
      topic: TransportHeader.qualifiedNameOf(event.message_type),
      key: null,
      headers: TransportHeader.ofRedelivery(event, tags),
      createdAt: Date.now(),
      payload: JSON.parse(event.payload),
    };
  }

  static qualifiedNameOf(messageType: string): string {
    return messageType.split('#')[0];
  }
}
