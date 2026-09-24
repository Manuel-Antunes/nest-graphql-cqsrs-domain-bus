import type { MigrationsOptions, NamingStrategy } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/postgresql';

import { TenantMigrationGenerator } from './tenant-migration.generator';

describe('a tenant migration', () => {
  const Generator = TenantMigrationGenerator([
    { meta: { tableName: 'auth_user', schema: 'public' } },
  ] as never);

  const generate = (up: string[], down: string[] = []) =>
    new Generator(
      {} as AbstractSqlDriver,
      {} as NamingStrategy,
      {} as MigrationsOptions,
    ).generateMigrationFile('Migration1_tenant', { up, down });

  it('names no schema: every tenant table is written against the schema it runs in', () => {
    const file = generate([
      'create schema if not exists "tenant_root";',
      'create table "tenant_root"."posts" ("id" varchar(36) not null, primary key ("id"));',
      'create index "posts_created_at_index" on "tenant_root"."posts" ("created_at");',
    ]);

    expect(file).not.toContain('tenant_root');
    expect(file).toContain('create schema if not exists ${schema};');
    expect(file).toContain('create table ${schema}."posts"');
    expect(file).toContain('on ${schema}."posts" ("created_at")');
  });

  it('reads that schema off the connection, quoted, at the top of up and down', () => {
    const file = generate(
      ['create table "tenant_root"."tags" ("id" varchar(36) not null);'],
      ['drop table if exists "tenant_root"."tags" cascade;'],
    );

    expect(file).toContain('private getConnectionSchema(): string {');
    expect(file).toContain(
      'em.getPlatform().quoteIdentifier(schema as string)',
    );
    expect(
      file.match(/const schema = this\.getConnectionSchema\(\);/g),
    ).toHaveLength(2);
  });

  it('points a reference to a system table at the system schema, whatever tenant runs it', () => {
    const file = generate([
      'alter table "tenant_root"."posts" add constraint "posts_owner_id_foreign" foreign key ("owner_id") references "auth_user" ("id");',
      'alter table "tenant_root"."devices" add constraint "devices_user_id_foreign" foreign key ("user_id") references "tenant_root"."auth_user" ("id");',
    ]);

    expect(file).toContain('references "public"."auth_user" ("id")');
    expect(file).not.toContain('${schema}."auth_user"');
  });
});
