import { inRequestContext } from '@nestposts/database';
import { type AnyMikroORM, closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { AuthUser } from '@nestposts/auth/domain/auth/auth-user.entity';
import { AuthConfiguration } from '@nestposts/auth/infrastructure/better-auth/config';
import { BetterAuthInstance } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import {
  BetterAuthPlugins,
} from '@nestposts/auth/infrastructure/better-auth/plugins/registry';
import { BETTER_AUTH_CONFIG } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { mikroOrmAdapter } from 'better-auth-mikro-orm';
import { InvitationNotifier } from '../../domain/organization/invitation.notifier';
import { Member } from '../../domain/organization/member.entity';
import { Organization } from '../../domain/organization/organization.entity';
import { OrganizationId } from '../../domain/organization/vo/organization-id';
import { OrganizationSlug } from '../../domain/organization/vo/organization-slug';
import { organizationAuthPluginProviders } from '../better-auth/organization-better-auth.plugin';
import { silentInvitationNotifier } from '../notifier/logging-invitation.notifier';
import { OrganizationEntities } from './organization-entities';

describe('better-auth writing through the organization entities', () => {
  let orm: AnyMikroORM;
  let adapter: ReturnType<ReturnType<typeof mikroOrmAdapter>>;

  const NOW = new Date('2026-09-21T12:00:00.000Z');

  const inContext = <T>(work: () => Promise<T>): Promise<T> => inRequestContext(orm.em, work);

  const found = <T extends object>(
    entity: { new (): T },
    where: object,
    populate?: string[],
  ): Promise<T> =>
    inContext(() => orm.em.fork().findOneOrFail(entity, where, { populate }) as Promise<T>);

  /**
   * Slugs this spec has created. Their tenant schemas are made by the trigger on `organization`,
   * which puts them OUTSIDE the throwaway schema this suite runs in — so dropping that one does not
   * take them with it, and they would survive the run.
   */
  const tenantSchemas: string[] = [];

  const created = async (model: string, data: Record<string, unknown>): Promise<string> => {
    const row = await inContext(() =>
      adapter.create<Record<string, unknown>, { id: string }>({ model, data, forceAllowId: true }),
    );
    return row.id;
  };

  beforeAll(async () => {
    orm = await testDatabase({ entities: OrganizationEntities.withAuth() }, 'org');
    const config = AuthConfiguration.fromEnvironment();
    adapter = mikroOrmAdapter(orm)(
      BetterAuthInstance.optionsFor(
        config,
        BetterAuthPlugins.build(BetterAuthPlugins.providersWith(organizationAuthPluginProviders), [
          [BETTER_AUTH_CONFIG, config],
          [InvitationNotifier, silentInvitationNotifier],
        ]),
      ),
    );
  });

  afterAll(async () => {
    for (const slug of tenantSchemas) {
      await orm.em.getConnection().execute(`drop schema if exists "tenant_${slug}" cascade`);
    }
    await closeTestDatabase(orm);
  });

  const givenACredential = (id: string, email: string) =>
    created('user', {
      id,
      name: 'Manuel',
      email,
      emailVerified: false,
      createdAt: NOW,
      updatedAt: NOW,
    });

  const givenAnOrganization = (id: string, slug: string) => {
    tenantSchemas.push(slug);
    return created('organization', { id, name: 'Acme', slug, createdAt: NOW });
  };

  const givenAMembership = (id: string, organizationId: string, userId: string, role: string) =>
    created('member', { id, organizationId, userId, role, createdAt: NOW });

  it('finds our classes by the model names better-auth derives', () => {
    const metadata = orm.getMetadata();

    expect(metadata.getByClassName('Organization').class).toBe(Organization);
    expect(metadata.getByClassName('Member').class).toBe(Member);
    expect(metadata.getByClassName('Organization').tableName).toBe('organization');
  });

  it("the session grows the organization column, because the plugin is part of this module's schema", () => {
    const session = orm.getMetadata().getByClassName('Session');

    expect(Object.keys(session.properties)).toContain('activeOrganizationId');
  });

  it('a row better-auth wrote comes back as the domain entity, value objects included', async () => {
    await givenAnOrganization('org_1', 'acme');

    const organization = await found(Organization, { id: OrganizationId.parse('org_1') });

    expect(organization.id).toBeInstanceOf(OrganizationId);
    expect(organization.slug).toBeInstanceOf(OrganizationSlug);
    expect(organization.slug.value).toBe('acme');
  });

  it('the two foreign keys better-auth names as ids arrive as references on the entity', async () => {
    await givenACredential('cred_2', 'ana@example.com');
    await givenAnOrganization('org_2', 'globex');
    await givenAMembership('member_2', 'org_2', 'cred_2', 'owner');

    const member = await found(Member, { id: 'member_2' }, ['organization', 'user']);

    expect(member.belongsTo(OrganizationId.parse('org_2'))).toBe(true);
    expect(member.identifies(CredentialId.parse('cred_2'))).toBe(true);
    expect(member.isOwner()).toBe(true);
    expect(member.organization.getEntity().slug.value).toBe('globex');
    expect(member.user.getEntity()).toBeInstanceOf(AuthUser);
    expect(member.user.getEntity().email.value).toBe('ana@example.com');
  });

  it('and better-auth reads them back flat, as the ids it wrote', async () => {
    await givenACredential('cred_3', 'rui@example.com');
    await givenAnOrganization('org_3', 'initech');
    await givenAMembership('member_3', 'org_3', 'cred_3', 'admin');

    const row = await inContext(() =>
      adapter.findOne<Record<string, unknown>>({
        model: 'member',
        where: [
          { field: 'organizationId', value: 'org_3' },
          { field: 'userId', value: 'cred_3' },
        ],
      }),
    );

    expect(row).toMatchObject({
      id: 'member_3',
      organizationId: 'org_3',
      userId: 'cred_3',
      role: 'admin',
    });
  });

  it('an update through better-auth lands on the value-object column', async () => {
    await givenACredential('cred_4', 'sofia@example.com');
    await givenAnOrganization('org_4', 'umbrella');
    await givenAMembership('member_4', 'org_4', 'cred_4', 'member');

    await inContext(() =>
      adapter.update({
        model: 'member',
        where: [{ field: 'id', value: 'member_4' }],
        update: { role: 'admin' },
      }),
    );

    const member = await found(Member, { id: 'member_4' });

    expect(member.role.value).toBe('admin');
    expect(member.isAdmin()).toBe(true);
  });
});
