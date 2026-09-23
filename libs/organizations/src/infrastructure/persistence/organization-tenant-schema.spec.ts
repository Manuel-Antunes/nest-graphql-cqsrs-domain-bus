import { inRequestContext } from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';

import { Organization } from '../../domain/organization/organization.entity';
import { OrganizationId } from '../../domain/organization/vo/organization-id';
import { OrganizationName } from '../../domain/organization/vo/organization-name';
import { OrganizationSlug } from '../../domain/organization/vo/organization-slug';
import { OrganizationEntities } from './organization-entities';

describe('the tenant schema an organization brings with it', () => {
  let orm: AnyMikroORM;

  const NOW = new Date('2026-09-21T12:00:00.000Z');
  const born: string[] = [];

  const schemasNamed = async (slug: string): Promise<string[]> => {
    const rows = (await orm.em
      .getConnection()
      .execute(
        `select nspname from pg_namespace where nspname = 'tenant_${slug}'`,
      )) as {
      nspname: string;
    }[];
    return rows.map((row) => row.nspname);
  };

  const givenAnOrganization = async (slug: string): Promise<Organization> => {
    born.push(slug);
    return inRequestContext(orm.em, async () => {
      const em = orm.em.fork();
      const organization = new Organization();
      organization.id = OrganizationId.parse(`org-${slug}`);
      organization.name = OrganizationName.parse('Acme');
      organization.slug = OrganizationSlug.parse(slug);
      organization.createdAt = NOW;
      await em.persist(organization).flush();
      return organization;
    });
  };

  beforeAll(async () => {
    orm = await testDatabase(
      { entities: OrganizationEntities.withAuth() },
      'auth_trigger',
    );
  });

  afterAll(async () => {
    for (const slug of born) {
      await orm.em
        .getConnection()
        .execute(`drop schema if exists "tenant_${slug}" cascade`);
    }
    await closeTestDatabase(orm);
  });

  it('is created with the row, by the database rather than by anybody remembering to', async () => {
    await givenAnOrganization('acme');

    await expect(schemasNamed('acme')).resolves.toEqual(['tenant_acme']);
  });

  it('survives a slug that needs quoting — which a %s trigger would have failed to even create', async () => {
    await givenAnOrganization('acme-corp');

    await expect(schemasNamed('acme-corp')).resolves.toEqual([
      'tenant_acme-corp',
    ]);
  });

  it('goes away with the row, everything in it included', async () => {
    const organization = await givenAnOrganization('globex');
    await expect(schemasNamed('globex')).resolves.toHaveLength(1);

    await inRequestContext(orm.em, async () => {
      const em = orm.em.fork();
      await em.nativeDelete(Organization, { id: organization.id });
    });

    await expect(schemasNamed('globex')).resolves.toEqual([]);
  });

  it('is idempotent: a second organization with a slug already taken does not fail the insert', async () => {
    await givenAnOrganization('initech');
    await orm.em
      .getConnection()
      .execute(`create schema if not exists "tenant_umbrella"`);
    born.push('umbrella');

    await expect(givenAnOrganization('umbrella')).resolves.toBeInstanceOf(
      Organization,
    );
    await expect(schemasNamed('umbrella')).resolves.toEqual([
      'tenant_umbrella',
    ]);
  });
});
