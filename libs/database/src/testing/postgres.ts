import { MikroORM } from '@mikro-orm/postgresql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DEFAULT_POSTGRES_URL, postgresUrl } from '../config/database.config';

export const POSTGRES_IMAGE = 'postgres:18-alpine';

const credentials = () => {
  const url = new URL(DEFAULT_POSTGRES_URL);
  return {
    database: url.pathname.slice(1),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
};

const reachable = async (clientUrl: string): Promise<boolean> => {
  try {
    const orm = await MikroORM.init({ clientUrl, schema: 'public', entities: [], discovery: { warnWhenNoEntities: false } });
    await orm.close(true);
    return true;
  } catch {
    return false;
  }
};

export type PostgresForTests = {
  clientUrl: string;
  stop: () => Promise<void>;
};

/**
 * The Postgres the suite talks to: the one already listening if there is one — `docker compose up -d
 * postgres`, or whatever `POSTGRES_URL` points at — and a throwaway container otherwise. It is the
 * same bargain `docker/e2e/run.sh` strikes with the broker, for the same reason: a suite that needs
 * infrastructure should not make everyone wait for a container they already have running.
 */
export async function startPostgres(): Promise<PostgresForTests> {
  const clientUrl = postgresUrl();
  if (await reachable(clientUrl)) {
    return { clientUrl, stop: async () => {} };
  }

  const { database, username, password } = credentials();
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

export default async function setup(): Promise<() => Promise<void>> {
  const postgres = await startPostgres();
  process.env.POSTGRES_URL = postgres.clientUrl;
  return () => postgres.stop();
}
