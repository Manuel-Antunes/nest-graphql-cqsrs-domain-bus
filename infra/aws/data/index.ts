/// <reference path="../../../.sst/platform/config.d.ts" />

import { dns, stageDomain } from '../edge/domain';
import { vpc } from '../network';
import { Neo4j } from './neo4j/components/neo4j';

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

/**
 * **Where every Better Auth instance keeps its sessions, in front of the `session` table** — and the
 * Nest cache the gateway resolves organizations through. Every function that holds Better Auth reads
 * the same one, or a session revoked by one of them stays valid in the others.
 *
 * Cluster mode is OFF: the applications hold a plain node-redis client (`libs/core/redis`), which a
 * cluster's configuration endpoint does not answer, and one node is all this needs. Valkey because it
 * is the cheaper engine (about $9 a month on a `t4g.micro`) and speaks Redis 7.2 — `EXPIRE … NX`,
 * which Better Auth's rate limiting counts with, is Redis 7. The component requires TLS, hence
 * `rediss://`.
 */
export const cache = new sst.aws.Redis('Cache', {
  vpc,
  engine: 'valkey',
  cluster: false,
});

/**
 * The auth token SST generates carries `#`, `&` and `$` — characters that end the userinfo of a URL —
 * so it is escaped, or node-redis parses a host out of the middle of the password.
 */
export const redisUrl = $resolve({
  username: cache.username,
  password: cache.password,
  host: cache.host,
  port: cache.port,
}).apply(
  ({ username, password, host, port }) =>
    `rediss://${encodeURIComponent(username)}:${encodeURIComponent(password ?? '')}@${host}:${port}`,
);

/**
 * **The lexical graph `libs/ai` indexes documents into** — Neo4j, as a Fargate service of its own
 * behind a network load balancer on Bolt (`Neo4j`, `neo4j/components`). The password is the
 * `Neo4jKey` secret, mirrored into SSM so another stage can reference this one with `Neo4j.get` and
 * the load balancer's ARN. A stage with a domain reaches it at `neo4j.<its domain>`. What connects to
 * it reads `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` and `NEO4J_DATABASE` (`libs/ai`'s config),
 * which are `graph.connectionInfo()`.
 */
export const graph = new Neo4j('Neo4j', {
  vpc,
  domain:
    dns && stageDomain ? { name: `neo4j.${stageDomain}`, dns } : undefined,
});
