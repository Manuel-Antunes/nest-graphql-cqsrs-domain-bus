import { Poll } from '../../support/poll';
import type { Database } from './database';

export interface IngestedMessage {
  message_type: string;
  origin: string | null;
}

export class MessageInbox {
  constructor(private readonly database: Database) {}

  /** One row per message this service ingested, with the service that produced it. */
  all(): Promise<IngestedMessage[]> {
    return this.database.query<IngestedMessage>(
      'select message_type, origin from transport_message_inbox order by received_at, identifier',
    );
  }

  async onceAny(
    predicate: (message: IngestedMessage) => boolean,
    timeoutMs: number,
  ): Promise<IngestedMessage[]> {
    const rows = await Poll.until(async () => {
      const all = await this.all();
      return all.some(predicate) ? all : undefined;
    }, timeoutMs);
    return rows ?? this.all();
  }

  rowsFor(identifier: string): Promise<number> {
    return this.database.count(
      'select count(*) as total from transport_message_inbox where identifier = ?',
      identifier,
    );
  }

  countFrom(origin: string): Promise<number> {
    return this.database.count(
      'select count(*) as total from transport_message_inbox where origin = ?',
      origin,
    );
  }
}
