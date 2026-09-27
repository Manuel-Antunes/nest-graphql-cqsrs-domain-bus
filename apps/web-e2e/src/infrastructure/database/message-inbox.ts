import { Poll } from '../../support/poll';
import type { Database } from './database';

export interface IngestedMessage {
  consumer: string;
  message_type: string;
  origin: string | null;
}

export class MessageInbox {
  constructor(private readonly database: Database) {}

  /** One row per message a service ingested: which service, what it was and who produced it. */
  all(): Promise<IngestedMessage[]> {
    return this.database.query<IngestedMessage>(
      'select consumer, message_type, origin from outbox_inbox order by processed_at, message_id',
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
      'select count(*) as total from outbox_inbox where message_id = ?',
      identifier,
    );
  }

  countOf(consumer: string, messageType: string): Promise<number> {
    return this.database.count(
      'select count(*) as total from outbox_inbox where consumer = ? and message_type like ?',
      consumer,
      `${messageType}%`,
    );
  }

  countFrom(origin: string): Promise<number> {
    return this.database.count(
      'select count(*) as total from outbox_inbox where origin = ?',
      origin,
    );
  }
}
