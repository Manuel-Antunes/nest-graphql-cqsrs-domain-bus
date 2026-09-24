/// <reference path="../../../.sst/platform/config.d.ts" />

import { Migrator, Seeder } from '../support';
import { migrations } from './platform';

/**
 * **The schema is `apps/migrator`'s here too**, and it runs on every deploy.
 *
 * No application creates a schema — `postgresDatabase` sets `ensureDatabase: { create: false }` — so
 * a service whose migrations have not run answers `relation ... does not exist`. Invoking the
 * migrator from the deploy is what turns that into a deploy that fails, rather than a forgotten
 * function and a broken first request.
 */
export const migrator = new Migrator('Migrate', {
  platform: migrations,
  handler: 'apps/migrator/dist/lambda.handler',
});

/**
 * **The rows the system should have**, in a function of its own and behind an invocation of its own.
 *
 * It is separate from {@link migrator} because the two answer different questions. A migration is a
 * ledger and re-running it costs one query, so it runs on every deploy; a seeder writes rows a person
 * can edit afterwards, so it runs when the **seeders** change — `Seeder` hashes the sources and lets
 * Pulumi decide. `SEED_*` in the environment is what changes who gets created without touching code.
 */
export const seeder = new Seeder('Seed', {
  platform: migrations,
  handler: 'apps/migrator/dist/lambda.seedHandler',
  seeds: ['apps/migrator/src/seeders'],
  after: migrator,
});
