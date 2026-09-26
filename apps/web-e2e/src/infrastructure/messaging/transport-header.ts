import type { StoredEvent } from '../database/event-log';

export class TransportHeader {
  static readonly MESSAGE_TYPE = 'cqrs-transport-message-type';
  static readonly IDENTIFIER = 'cqrs-transport-identifier';
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
      [TransportHeader.IDENTIFIER]: event.identifier,
      [TransportHeader.TIMESTAMP]: new Date().toISOString(),
      [TransportHeader.ORIGIN]: 'posts-api',
      [TransportHeader.TAGS]: tags,
    };
  }
}
