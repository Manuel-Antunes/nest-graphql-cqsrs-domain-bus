/// <reference path="../../../.sst/platform/config.d.ts" />

import { vpc } from '../network';

/**
 * **One database, two schemas** — `posts` and `tagging`, exactly as `docker-compose.yml` serves
 * locally. The separation that matters is the schema, because that is what a migration is qualified
 * with and what `apps/migrator` creates; two instances would buy isolation this proof of concept
 * does not need and would double the bill.
 */
/**
 * **The proxy is not an optimisation — it is what makes a pool survive a function.**
 *
 * A Lambda container is frozen the moment its handler returns and thawed when the next invocation
 * arrives, which may be minutes later. The MikroORM pool keeps its TCP connections across that,
 * while the database does not: the first query after a thaw answers
 * `DriverException: Connection terminated unexpectedly`, and what fails is whatever ran first — a
 * projection, or the append that a subscriber on another container was waiting for.
 *
 * RDS Proxy holds the real connections and hands the function a cheap one, so freezing costs
 * nothing and thawing finds a connection that is still there. It is the difference between a stack
 * that works and one that works on the first request after a deploy.
 */
export const database = new sst.aws.Postgres('Database', {
  vpc,
  instance: 't4g.micro',
  storage: '20 GB',
  proxy: true,
});

export const postgresUrl = $interpolate`postgresql://${database.username}:${database.password}@${database.host}:${database.port}/${database.database}`;

/** What a function connects to: the proxy's endpoint, which `database.host` becomes once it is on. */
export const databaseHost = database.host;
