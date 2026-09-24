import type { MikroORM } from '@mikro-orm/postgresql';

import { bootstrap, migrate, migrateTenants } from '../main';
import type { MigratorContext } from './bootstrap';

describe('migrating the system, then every tenant', () => {
  let context: MigratorContext;

  const query = <T>(orm: MikroORM, sql: string): Promise<T[]> =>
    orm.em.fork().getConnection().execute<T[]>(sql);

  const tablesOf = async (schema: string) =>
    (
      await query<{ table_name: string }>(
        context.orm,
        `select table_name from information_schema.tables where table_schema = '${schema}' order by table_name`,
      )
    ).map((row) => row.table_name);

  beforeAll(async () => {
    await migrate();
    context = await bootstrap();
  });

  afterAll(async () => {
    await query(
      context.orm,
      'drop schema if exists "tenant_acme-corp" cascade',
    );
    await context.app.close();
  });

  it('keeps the system tables — Better Auth’s and the organizations’ — in public, and nothing else', async () => {
    const tables = await tablesOf('public');

    expect(tables).toEqual(
      expect.arrayContaining([
        'auth_user',
        'session',
        'organization',
        'member',
        'invitation',
        'oauth_resource',
        'mikro_orm_migrations',
      ]),
    );
    expect(tables).not.toContain('posts');
    expect(tables).not.toContain('event_log');
  });

  it('keeps the transport’s bookkeeping — the inbox and the event log — in a schema of its own, with the system', async () => {
    expect(await tablesOf('transport')).toEqual([
      'event_log',
      'transport_message_inbox',
    ]);
  });

  it('gives the root tenant its own copy of every other table, and the default tag the saga needs', async () => {
    expect(await tablesOf('tenant_root')).toEqual(
      expect.arrayContaining([
        'posts',
        'tags',
        'posts_tags',
        'users',
        'authors',
        'notifications',
        'notification_deliveries',
        'devices',
        'mikro_orm_migrations',
      ]),
    );
    expect(await tablesOf('tenant_root')).not.toContain('event_log');
    expect(
      await query(context.orm, 'select id, name from tenant_root.tags'),
    ).toEqual([
      { id: '00000000-0000-4000-8000-000000000001', name: 'Untagged' },
    ]);
  });

  it('brings every tenant schema that exists up to date — an organization’s included, dash and all', async () => {
    await query(context.orm, 'create schema "tenant_acme-corp"');

    await migrateTenants();

    expect(await tablesOf('tenant_acme-corp')).toContain('posts');
    expect(
      await query(
        context.orm,
        'select name from "tenant_acme-corp".mikro_orm_migrations order by name',
      ),
    ).toEqual([
      { name: 'Migration20260924124449_tenant' },
      { name: 'Migration20260924124450_default_tag' },
    ]);
  });

  it('is safe to run on every deploy: a second pass applies nothing', async () => {
    await migrate();

    expect(
      await query(
        context.orm,
        'select count(*)::int as applied from tenant_root.mikro_orm_migrations',
      ),
    ).toEqual([{ applied: 2 }]);
  });
});
