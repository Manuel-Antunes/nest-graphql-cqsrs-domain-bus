import { MikroORM } from '@mikro-orm/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

import { DEFAULT_POSTGRES_URL, postgresUrl } from '../config/database.config';

export const POSTGRES_IMAGE = 'postgres:18-alpine';

export type PostgresForTests = {
  clientUrl: string;
  stop: () => Promise<void>;
};

class TestPostgres {
  static async start(): Promise<PostgresForTests> {
    const clientUrl = postgresUrl();
    if (await TestPostgres.answers(clientUrl)) {
      return { clientUrl, stop: async () => {} };
    }

    const { database, username, password } = TestPostgres.credentials();
    const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
      POSTGRES_IMAGE,
    )
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
      orm = await MikroORM.init({
        clientUrl,
        schema: 'public',
        entities: [],
        discovery: { warnWhenNoEntities: false },
      });
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
export const startPostgres = (): Promise<PostgresForTests> =>
  TestPostgres.start();

/**
 * The variable a project names a database of its own with — `testProject({ database: 'own' })`.
 *
 * A spec that exercises the real layout, `public` and `tenant_root` by those names, cannot share them
 * with every other project of the run, nor with the development database that `docker compose`
 * publishes on the same server. It gets a database created for the run and dropped after it.
 */
export const OWN_DATABASE = 'POSTGRES_OWN_DATABASE';

export const onDatabase = (clientUrl: string, database: string): string => {
  const url = new URL(clientUrl);
  url.pathname = `/${database}`;
  return url.toString();
};

class OwnDatabase {
  static async create(
    serverUrl: string,
    name: string,
  ): Promise<() => Promise<void>> {
    await OwnDatabase.execute(serverUrl, `create database "${name}"`);
    return () =>
      OwnDatabase.execute(
        serverUrl,
        `drop database if exists "${name}" with (force)`,
      );
  }

  private static async execute(clientUrl: string, sql: string): Promise<void> {
    const orm = await MikroORM.init({
      clientUrl,
      schema: 'public',
      entities: [],
      discovery: { warnWhenNoEntities: false },
    });
    try {
      await orm.em.getConnection().execute(sql);
    } finally {
      await orm.close(true);
    }
  }
}

export default async function setup(): Promise<() => Promise<void>> {
  const postgres = await startPostgres();
  const own = process.env[OWN_DATABASE];
  if (!own) {
    process.env.POSTGRES_URL = postgres.clientUrl;
    return () => postgres.stop();
  }
  const drop = await OwnDatabase.create(postgres.clientUrl, own);
  process.env.POSTGRES_URL = onDatabase(postgres.clientUrl, own);
  return async () => {
    await drop();
    await postgres.stop();
  };
}
