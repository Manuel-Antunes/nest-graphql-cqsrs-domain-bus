import pg from 'pg';

import { RunEnvironment } from '../../environment/run-environment';

/*
 * `count(*)` is a bigint in Postgres, and the driver gives a bigint back as a STRING so it cannot lose
 * precision. Every count here is a handful of rows, and `'1' === 1` is false — which would turn an
 * idempotency assertion into a failure that does not exist.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, Number);

/**
 * What the services durably kept in one tenant, read from outside them.
 *
 * Every service shares one Postgres laid out by tenancy: the tenant's own tables in `tenant_<name>`,
 * the inbox and the event log in `transport`, the system tables in `public`. The `search_path` names
 * all three, in that order, and every statement is written as if its tables were the only ones there.
 */
export class Database {
  constructor(
    private readonly url: string,
    readonly schemas: readonly string[],
  ) {}

  static ofTenant(
    url: string,
    tenant: string = RunEnvironment.ROOT_TENANT,
  ): Database {
    return new Database(url, [`tenant_${tenant}`, 'transport', 'public']);
  }

  get schema(): string {
    return this.schemas[0] ?? 'public';
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    ...parameters: unknown[]
  ): Promise<T[]> {
    const client = new pg.Client({ connectionString: this.url });
    await client.connect();
    try {
      await client.query(
        `set search_path to ${this.schemas.map((schema) => `"${schema}"`).join(', ')}`,
      );
      const { rows } = await client.query(Database.positional(sql), parameters);
      return rows as T[];
    } finally {
      await client.end();
    }
  }

  async execute(sql: string, ...parameters: unknown[]): Promise<void> {
    await this.query(sql, ...parameters);
  }

  async count(sql: string, ...parameters: unknown[]): Promise<number> {
    const [row] = await this.query<{ total: number }>(sql, ...parameters);
    return row?.total ?? 0;
  }

  private static positional(sql: string): string {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  }
}
