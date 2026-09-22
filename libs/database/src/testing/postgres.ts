import { MikroORM } from '@mikro-orm/postgresql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DEFAULT_POSTGRES_URL, postgresUrl } from '../config/database.config';

export const POSTGRES_IMAGE = 'postgres:18-alpine';

export type PostgresForTests = {
  clientUrl: string;
  stop: () => Promise<void>;
};

class TestPostgres {
  static async start(): Promise<PostgresForTests> {
    const clientUrl = postgresUrl();
    if (await this.answers(clientUrl)) {
      return { clientUrl, stop: async () => {} };
    }

    const { database, username, password } = this.credentials();
    const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase(database)
      .withUsername(username)
      .withPassword(password)
      .start();

    return {
      clientUrl: container.getConnectionUri(),
      stop: async () => {
        await container.stop();
      },
    };
  }

  private static async answers(clientUrl: string): Promise<boolean> {
    let orm: MikroORM | undefined;
    try {
      orm = await MikroORM.init({ clientUrl, schema: 'public', entities: [], discovery: { warnWhenNoEntities: false } });
      await orm.em.getConnection().execute('select 1');
      return true;
    } catch {
      return false;
    } finally {
      await orm?.close(true).catch(() => undefined);
    }
  }

  private static credentials() {
    const url = new URL(DEFAULT_POSTGRES_URL);
    return {
      database: url.pathname.slice(1),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  }
}

/**
 * The Postgres the suite talks to: the one already listening if there is one — `docker compose up -d
 * postgres`, or whatever `POSTGRES_URL` points at — and a throwaway container otherwise. It is the
 * same bargain `docker/e2e/run.sh` strikes with the broker, for the same reason: a suite that needs
 * infrastructure should not make everyone wait for a container they already have running.
 *
 * Telling the two apart costs a **statement**, not an `init`. The pool is lazy, so `MikroORM.init`
 * resolves without ever reaching the server, and `isConnected()` answers `false` for a healthy one
 * nobody has queried yet — which left this deciding by a question neither branch could hear. It said
 * "already listening" to a dead port, and to ANOTHER project's Postgres holding 5432: the container
 * never started, and every spec failed with `password authentication failed`, which reads like a
 * credentials bug and is a port conflict.
 */
export const startPostgres = (): Promise<PostgresForTests> => TestPostgres.start();

export default async function setup(): Promise<() => Promise<void>> {
  const postgres = await startPostgres();
  process.env.POSTGRES_URL = postgres.clientUrl;
  return () => postgres.stop();
}
