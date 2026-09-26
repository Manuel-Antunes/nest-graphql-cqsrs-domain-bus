import { AuthUser } from '@nestposts/auth/domain/auth/auth-user.entity';
import { AuthConfiguration } from '@nestposts/auth/infrastructure/better-auth/config';
import { BetterAuthEmails } from '@nestposts/auth/infrastructure/better-auth/emails/better-auth-emails';
import { BetterAuthInstance } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { BetterAuthPlugins } from '@nestposts/auth/infrastructure/better-auth/plugins/registry';
import { BETTER_AUTH_CONFIG } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { inRequestContext } from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { LoggingOnDemandNotifications } from '@nestposts/notifications/infrastructure/on-demand/logging-on-demand-notifications';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { mikroOrmAdapter } from 'better-auth-mikro-orm';

import { Member } from '../../domain/organization/member.entity';
import { Organization } from '../../domain/organization/organization.entity';
import { Team } from '../../domain/organization/team.entity';
import { TeamMember } from '../../domain/organization/team-member.entity';
import { OrganizationId } from '../../domain/organization/vo/organization-id';
import { OrganizationSlug } from '../../domain/organization/vo/organization-slug';
import { TeamId } from '../../domain/organization/vo/team-id';
import { TeamName } from '../../domain/organization/vo/team-name';
import { organizationAuthPluginProviders } from '../better-auth/organization-better-auth.plugin';
import { OrganizationEntities } from './organization-entities';
import { MikroOrmTeamRepository } from './repositories/mikro-orm-team.repository';
import { MikroOrmTeamMemberRepository } from './repositories/mikro-orm-team-member.repository';

describe('better-auth writing through the organization entities', () => {
  let orm: AnyMikroORM;
  let adapter: ReturnType<ReturnType<typeof mikroOrmAdapter>>;

  const NOW = new Date('2026-09-21T12:00:00.000Z');

  const inContext = <T>(work: () => Promise<T>): Promise<T> =>
    inRequestContext(orm.em, work);

  const found = <T extends object>(
    entity: { new (): T },
    where: object,
    populate?: string[],
  ): Promise<T> =>
    inContext(
      () =>
        orm.em.fork().findOneOrFail(entity, where, { populate }) as Promise<T>,
    );

  /**
   * Slugs this spec has created. Their tenant schemas are made by the trigger on `organization`,
   * which puts them OUTSIDE the throwaway schema this suite runs in — so dropping that one does not
   * take them with it, and they would survive the run.
   */
  const tenantSchemas: string[] = [];

  const created = async (
    model: string,
    data: Record<string, unknown>,
  ): Promise<string> => {
    const row = await inContext(() =>
      adapter.create<Record<string, unknown>, { id: string }>({
        model,
        data,
        forceAllowId: true,
      }),
    );
    return row.id;
  };

  beforeAll(async () => {
    orm = await testDatabase(
      { entities: OrganizationEntities.withAuth() },
      'org',
    );
    const config = AuthConfiguration.fromEnvironment();
    const emails = BetterAuthEmails.unsent();
    adapter = mikroOrmAdapter(orm)(
      BetterAuthInstance.optionsFor(
        config,
        BetterAuthPlugins.build(
          BetterAuthPlugins.providersWith(organizationAuthPluginProviders),
          [
            [BETTER_AUTH_CONFIG, config],
            [BetterAuthEmails, emails],
            [OnDemandNotifications, new LoggingOnDemandNotifications()],
          ],
        ),
        emails,
      ),
    );
  });

  afterAll(async () => {
    for (const slug of tenantSchemas) {
      await orm.em
        .getConnection()
        .execute(`drop schema if exists "tenant_${slug}" cascade`);
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

  const givenAMembership = (
    id: string,
    organizationId: string,
    userId: string,
    role: string,
  ) => created('member', { id, organizationId, userId, role, createdAt: NOW });

  const givenATeam = (id: string, organizationId: string) =>
    created('team', {
      id,
      name: 'Design',
      organizationId,
      memberCount: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

  const givenATeamMembership = (id: string, teamId: string, userId: string) =>
    created('teamMember', { id, teamId, userId, createdAt: NOW });

  it('finds our classes by the model names better-auth derives', () => {
    const metadata = orm.getMetadata();

    expect(metadata.getByClassName('Organization').class).toBe(Organization);
    expect(metadata.getByClassName('Member').class).toBe(Member);
    expect(metadata.getByClassName('Team').class).toBe(Team);
    expect(metadata.getByClassName('TeamMember').class).toBe(TeamMember);
    expect(metadata.getByClassName('TeamMember').tableName).toBe('team_member');
    expect(metadata.getByClassName('Organization').tableName).toBe(
      'organization',
    );
  });

  it("the session grows the organization column, because the plugin is part of this module's schema", () => {
    const session = orm.getMetadata().getByClassName('Session');

    expect(Object.keys(session.properties)).toContain('activeOrganizationId');
  });

  it('a row better-auth wrote comes back as the domain entity, value objects included', async () => {
    await givenAnOrganization('org_1', 'hooli');

    const organization = await found(Organization, {
      id: OrganizationId.parse('org_1'),
    });

    expect(organization.id).toBeInstanceOf(OrganizationId);
    expect(organization.slug).toBeInstanceOf(OrganizationSlug);
    expect(organization.slug.value).toBe('hooli');
  });

  it('the two foreign keys better-auth names as ids arrive as references on the entity', async () => {
    await givenACredential('cred_2', 'ana@example.com');
    await givenAnOrganization('org_2', 'soylent');
    await givenAMembership('member_2', 'org_2', 'cred_2', 'owner');

    const member = await found(Member, { id: 'member_2' }, [
      'organization',
      'user',
    ]);

    expect(member.belongsTo(OrganizationId.parse('org_2'))).toBe(true);
    expect(member.identifies(CredentialId.parse('cred_2'))).toBe(true);
    expect(member.isOwner()).toBe(true);
    expect(member.organization.getEntity().slug.value).toBe('soylent');
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

  it('a team and its member better-auth wrote come back as the domain entities, connected by references', async () => {
    await givenACredential('cred_5', 'lia@example.com');
    await givenAnOrganization('org_5', 'globex');
    await givenATeam('team_5', 'org_5');
    await givenATeamMembership('team_member_5', 'team_5', 'cred_5');

    const team = await found(Team, { id: TeamId.parse('team_5') }, [
      'organization',
    ]);
    const [member] = await inContext(async () => {
      const members = await new MikroOrmTeamMemberRepository(orm.em).findAllIn(
        TeamId.parse('team_5'),
      );
      await orm.em.populate(members, ['team', 'user']);
      return members;
    });

    expect(team.name).toBeInstanceOf(TeamName);
    expect(team.name.value).toBe('Design');
    expect(team.belongsTo(OrganizationId.parse('org_5'))).toBe(true);
    expect(team.belongsTo(OrganizationId.parse('org_1'))).toBe(false);
    expect(team.organization.getEntity().slug.value).toBe('globex');
    expect(member.identifies(CredentialId.parse('cred_5'))).toBe(true);
    expect(member.team.getEntity().name.value).toBe('Design');
    expect(member.user.getEntity()).toBeInstanceOf(AuthUser);
  });

  it('and better-auth reads a team member back flat, as the ids it wrote', async () => {
    await givenACredential('cred_9', 'noa@example.com');
    await givenAnOrganization('org_9', 'wayne');
    await givenATeam('team_9', 'org_9');
    await givenATeamMembership('team_member_9', 'team_9', 'cred_9');

    const row = await inContext(() =>
      adapter.findOne<Record<string, unknown>>({
        model: 'teamMember',
        where: [
          { field: 'teamId', value: 'team_9' },
          { field: 'userId', value: 'cred_9' },
        ],
      }),
    );

    expect(row).toMatchObject({
      id: 'team_member_9',
      teamId: 'team_9',
      userId: 'cred_9',
    });
  });

  it('takes an organization’s teams and their members with it, which better-auth leaves to the database', async () => {
    await givenACredential('cred_10', 'max@example.com');
    await givenAnOrganization('org_10', 'stark');
    await givenATeam('team_10', 'org_10');
    await givenATeamMembership('team_member_10', 'team_10', 'cred_10');

    await inContext(() =>
      adapter.deleteMany({
        model: 'member',
        where: [{ field: 'organizationId', value: 'org_10' }],
      }),
    );
    await inContext(() =>
      adapter.delete({
        model: 'organization',
        where: [{ field: 'id', value: 'org_10' }],
      }),
    );

    const left = await inContext(() =>
      Promise.all([
        orm.em.fork().count(Team, { id: TeamId.parse('team_10') }),
        orm.em.fork().count(TeamMember, { team: TeamId.parse('team_10') }),
      ]),
    );
    expect(left).toEqual([0, 0]);
  });

  it('lists an organization’s teams by name, and nobody else’s', async () => {
    await givenAnOrganization('org_7', 'cyberdyne');
    await givenAnOrganization('org_8', 'tyrell');
    await created('team', {
      id: 'team_7b',
      name: 'Sales',
      organizationId: 'org_7',
      memberCount: 0,
      createdAt: NOW,
    });
    await givenATeam('team_7a', 'org_7');
    await givenATeam('team_8', 'org_8');

    const teams = await inContext(() =>
      new MikroOrmTeamRepository(orm.em).findAllIn(
        OrganizationId.parse('org_7'),
      ),
    );

    expect(teams.map((team) => team.id.value)).toEqual(['team_7a', 'team_7b']);
  });

  it('keeps counting a team’s members through the column better-auth increments', async () => {
    await givenAnOrganization('org_6', 'massive-dynamic');
    await givenATeam('team_6', 'org_6');

    await inContext(() =>
      adapter.incrementOne({
        model: 'team',
        where: [{ field: 'id', value: 'team_6' }],
        increment: { memberCount: 1 },
      }),
    );

    const team = await found(Team, { id: TeamId.parse('team_6') });
    expect(team.memberCount).toBe(1);
  });
});
