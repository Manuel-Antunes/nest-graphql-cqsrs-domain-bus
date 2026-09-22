import pg from 'pg';

const { Client } = pg;

/*
 * `count(*)` is a bigint in Postgres, and the driver gives a bigint back as a STRING so it cannot lose
 * precision. Every count here is a handful of rows, and `'1' === 1` is false — which would turn an
 * idempotency assertion into a failure that does not exist.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

export const POSTGRES_URL =
  process.env.POSTGRES_URL ?? 'postgresql://nestposts:nestposts@localhost:5432/nestposts';

/** `?` is what the statements here are written with; Postgres calls it `$1`. */
const positional = (sql: string): string => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
};

/**
 * What one service durably kept, read from outside it.
 *
 * The two services share a Postgres and are separated by their **schema**, so the schema is the whole
 * address: `search_path` is set per connection and every statement below is written as if its tables
 * were the only ones there.
 */
export class ServiceDatabase {
  constructor(readonly schema: string) {}

  async query<T = Record<string, unknown>>(sql: string, ...parameters: unknown[]): Promise<T[]> {
    const client = new Client({ connectionString: POSTGRES_URL });
    await client.connect();
    try {
      await client.query(`set search_path to "${this.schema}"`);
      const { rows } = await client.query(positional(sql), parameters);
      return rows as T[];
    } finally {
      await client.end();
    }
  }

  async execute(sql: string, ...parameters: unknown[]): Promise<void> {
    await this.query(sql, ...parameters);
  }

  /** The event types of one aggregate's stream, in the order they were appended. */
  async streamOf(aggregateId: string): Promise<string[]> {
    const rows = await this.query<{ message_type: string }>(
      'select message_type from event_log where stream_id = ? order by sequence',
      aggregateId,
    );
    return rows.map((row) => row.message_type);
  }

  async countEvents(aggregateId: string, type: string): Promise<number> {
    const [row] = await this.query<{ total: number }>(
      'select count(*) as total from event_log where stream_id = ? and message_type like ?',
      aggregateId,
      `${type}%`,
    );
    return row?.total ?? 0;
  }

  async eventOf(aggregateId: string, type: string): Promise<StoredEvent> {
    const [row] = await this.query<StoredEvent>(
      'select identifier, message_type, payload from event_log where stream_id = ? and message_type like ?',
      aggregateId,
      `${type}%`,
    );
    if (!row) {
      throw new Error(`nenhum ${type} no stream de ${aggregateId} em ${this.schema}`);
    }
    return row;
  }

  /** One row per message this service ingested, with the service that produced it. */
  inbox(): Promise<IngestedMessage[]> {
    return this.query<IngestedMessage>(
      'select message_type, origin from transport_message_inbox order by received_at, identifier',
    );
  }

  async inboxRowsFor(identifier: string): Promise<number> {
    const [row] = await this.query<{ total: number }>(
      'select count(*) as total from transport_message_inbox where identifier = ?',
      identifier,
    );
    return row?.total ?? 0;
  }

  async post(id: string): Promise<{ version: number; published_at: Date | null } | undefined> {
    const [row] = await this.query<{ version: number; published_at: Date | null }>(
      'select version, published_at from posts where id = ?',
      id,
    );
    return row;
  }

  async tagsOf(postId: string): Promise<string[]> {
    const rows = await this.query<{ name: string }>(
      'select t.name from posts_tags pt join tags t on t.id = pt.tag_id where pt.post_id = ? order by t.name',
      postId,
    );
    return rows.map((row) => row.name);
  }

  /**
   * The author role, granted straight on the credential.
   *
   * It is the only thing this suite does around the application's own doors, and it is deliberate:
   * granting a role is not an operation of this service (the identity port does it, in code), and
   * opening an endpoint for it would be production surface existing because of a test. The domain
   * profile is promoted by the application itself on the next request.
   */
  promoteToAuthor(credentialId: string): Promise<void> {
    return this.execute('update auth_user set role = ? where id = ?', 'author', credentialId);
  }
}

export interface StoredEvent {
  identifier: string;
  message_type: string;
  payload: string;
}

export interface IngestedMessage {
  message_type: string;
  origin: string | null;
}
