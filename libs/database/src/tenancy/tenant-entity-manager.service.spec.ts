import { defineEntity, MikroORM, p } from '@mikro-orm/core';
import { Migration } from '@mikro-orm/migrations';
import { MikroORM as PostgresMikroORM } from '@mikro-orm/postgresql';

import {
  postgresDatabase,
  SYSTEM_SCHEMA,
  TENANT_SCHEMA,
} from '../config/database.config';
import type { AnyMikroORM } from '../testing/test-database';
import { TenantEntityManagerService } from './tenant-entity-manager.service';

class Thing {
  id!: string;
}

const ThingSchema = defineEntity({
  class: Thing,
  tableName: 'thing',
  schema: TENANT_SCHEMA,
  properties: { id: p.string().primary() },
});

class CreateThing extends Migration {
  override up(): void {
    this.addSql(
      `create table "${this.config.get('schema')}"."thing" ("id" varchar(255) not null, primary key ("id"))`,
    );
  }
}

const migrations = {
  migrationsList: [{ name: 'CreateThing', class: CreateThing }],
};

describe('the entity manager a tenant works on', () => {
  let orm: AnyMikroORM;

  const service = () => new TenantEntityManagerService(orm, migrations);

  const schemaExists = async (schema: string) =>
    (
      await orm.em
        .fork()
        .getConnection()
        .execute('select 1 from pg_namespace where nspname = ?', [schema])
    ).length > 0;

  const migrationsIn = (schema: string): Promise<{ name: string }[]> =>
    orm.em
      .fork()
      .getConnection()
      .execute(`select name from "${schema}"."mikro_orm_migrations"`);

  const dropSchemas = (...schemas: string[]) =>
    Promise.all(
      schemas.map((schema) =>
        orm.em
          .fork()
          .getConnection()
          .execute(`drop schema if exists "${schema}" cascade`),
      ),
    );

  beforeAll(async () => {
    orm = (await PostgresMikroORM.init(
      postgresDatabase(SYSTEM_SCHEMA, { entities: [ThingSchema] }),
    )) as AnyMikroORM;
  });

  afterAll(async () => {
    await dropSchemas(
      'tenant_root',
      'tenant_acme',
      'tenant_ghost',
      'tenant_globex',
      'tenant_initech',
    );
    await orm.close(true);
  });

  it('migrates the root tenant’s schema the first time, and binds the entity manager to it', async () => {
    const em = await service().createAndMigrateTenantEntityManager('root');

    expect(em.schema).toBe('tenant_root');
    expect(await migrationsIn('tenant_root')).toEqual([
      { name: 'CreateThing' },
    ]);

    const scoped = em.fork();
    scoped.persist(scoped.create(Thing, { id: 'a-thing' }));
    await scoped.flush();
    expect(
      await orm.em
        .fork()
        .getConnection()
        .execute('select id from "tenant_root"."thing"'),
    ).toEqual([{ id: 'a-thing' }]);
  });

  it('migrates once per process: every later request of the tenant is handed the same manager', async () => {
    const tenants = service();
    const init = vi.spyOn(MikroORM, 'init');

    const [first, second] = await Promise.all([
      tenants.createAndMigrateTenantEntityManager('root'),
      tenants.createAndMigrateTenantEntityManager('Root'),
    ]);
    const third = await tenants.createAndMigrateTenantEntityManager('root');

    expect(first).toBe(second);
    expect(third).toBe(first);
    expect(init).toHaveBeenCalledTimes(1);
    init.mockRestore();
  });

  it('creates no schema a header merely names', async () => {
    const em = await service().createAndMigrateTenantEntityManager('ghost');

    expect(em.schema).toBe('tenant_ghost');
    expect(await schemaExists('tenant_ghost')).toBe(false);
  });

  it('migrates a tenant whose schema its organization already made, on the first request', async () => {
    await orm.em.fork().getConnection().execute('create schema "tenant_acme"');

    await service().createAndMigrateTenantEntityManager('acme');

    expect(await migrationsIn('tenant_acme')).toEqual([
      { name: 'CreateThing' },
    ]);
  });

  it('provisions a tenant nobody has asked for yet: its schema and its tables', async () => {
    await service().provision('globex');

    expect(await schemaExists('tenant_globex')).toBe(true);
    expect(await migrationsIn('tenant_globex')).toEqual([
      { name: 'CreateThing' },
    ]);
  });

  it('lets two processes meet a new tenant at once, and migrates it once', async () => {
    await Promise.all([
      service().provision('initech'),
      service().provision('initech'),
    ]);

    expect(await migrationsIn('tenant_initech')).toEqual([
      { name: 'CreateThing' },
    ]);
  });
});
