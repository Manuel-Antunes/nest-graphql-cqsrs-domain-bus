import { Poll } from '../../support/poll';
import type { Database } from './database';

export interface StoredEvent {
  identifier: string;
  message_type: string;
  payload: string;
}

export class EventLog {
  constructor(private readonly database: Database) {}

  static withoutVersion(messageType: string): string {
    return messageType.split('#')[0];
  }

  /** The event types of one aggregate's stream, in the order they were appended. */
  async streamOf(aggregateId: string): Promise<string[]> {
    const rows = await this.database.query<{ message_type: string }>(
      'select message_type from event_log where stream_id = ? order by sequence',
      aggregateId,
    );
    return rows.map((row) => EventLog.withoutVersion(row.message_type));
  }

  whenStreamHas(
    aggregateId: string,
    type: string,
    timeoutMs: number,
  ): Promise<string[] | undefined> {
    return Poll.until(async () => {
      const stream = await this.streamOf(aggregateId);
      return stream.includes(type) ? stream : undefined;
    }, timeoutMs);
  }

  count(aggregateId: string, type: string): Promise<number> {
    return this.database.count(
      'select count(*) as total from event_log where stream_id = ? and message_type like ?',
      aggregateId,
      `${type}%`,
    );
  }

  async eventOf(aggregateId: string, type: string): Promise<StoredEvent> {
    const [row] = await this.database.query<StoredEvent>(
      'select identifier, message_type, payload from event_log where stream_id = ? and message_type like ?',
      aggregateId,
      `${type}%`,
    );
    if (!row) {
      throw new Error(
        `no ${type} in the stream of ${aggregateId} in ${this.database.schema}`,
      );
    }
    return row;
  }
}
