import type { EntityManager } from '@mikro-orm/core';
import type { Provider } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { AuthUser } from '@nestposts/auth/domain/auth/auth-user.entity';
import { AuthUserEntitySchema } from '@nestposts/auth/infrastructure/persistence/entities/auth-user-orm.entity';
import { DatabaseModule } from '@nestposts/database';
import { CalendarEvent } from '@nestposts/events/domain/calendar-event/calendar-event.entity';
import { CalendarEventDetails } from '@nestposts/events/domain/calendar-event/vo/calendar-event-details';
import { CalendarEventId } from '@nestposts/events/domain/calendar-event/vo/calendar-event-id';
import { CalendarEventWindow } from '@nestposts/events/domain/calendar-event/vo/calendar-event-window';
import { EventsInfrastructureModule } from '@nestposts/events/infrastructure/events-infrastructure.module';
import { Organization } from '@nestposts/organizations/domain/organization/organization.entity';
import { Team } from '@nestposts/organizations/domain/organization/team.entity';
import { TeamRepository } from '@nestposts/organizations/domain/organization/team.repository';
import { TeamMember } from '@nestposts/organizations/domain/organization/team-member.entity';
import { TeamMemberRepository } from '@nestposts/organizations/domain/organization/team-member.repository';
import { OrganizationId } from '@nestposts/organizations/domain/organization/vo/organization-id';
import { OrganizationName } from '@nestposts/organizations/domain/organization/vo/organization-name';
import { OrganizationSlug } from '@nestposts/organizations/domain/organization/vo/organization-slug';
import { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';
import { TeamMemberId } from '@nestposts/organizations/domain/organization/vo/team-member-id';
import { TeamName } from '@nestposts/organizations/domain/organization/vo/team-name';
import { OrganizationEntitySchema } from '@nestposts/organizations/infrastructure/persistence/entities/organization-orm.entity';
import { TeamMemberEntitySchema } from '@nestposts/organizations/infrastructure/persistence/entities/team-member-orm.entity';
import { TeamEntitySchema } from '@nestposts/organizations/infrastructure/persistence/entities/team-orm.entity';
import { MikroOrmTeamRepository } from '@nestposts/organizations/infrastructure/persistence/repositories/mikro-orm-team.repository';
import { MikroOrmTeamMemberRepository } from '@nestposts/organizations/infrastructure/persistence/repositories/mikro-orm-team-member.repository';
import { TenantOrganizations } from '@nestposts/organizations/infrastructure/tenancy/tenant-organizations.service';
import { User } from '@nestposts/users/domain/user/user.entity';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';
import { UserProvisioning } from '@nestposts/users/infrastructure/provisioning/user-provisioning.service';

import { CalendarAttendees } from '../../src/application/calendar-event/calendar-attendees.service';
import { freshEm } from './cqrs-testing-module';
import { T0 } from './post-fixtures';

export const TENANT = 'acme';

export const anOrganization = (slug = TENANT): Organization =>
  Object.assign(new Organization(), {
    id: OrganizationId.parse(`org_${slug}`),
    name: OrganizationName.parse(slug),
    slug: OrganizationSlug.parse(slug),
    createdAt: T0,
  });

export class StubTenantOrganizations {
  constructor(private readonly organization = anOrganization()) {}

  async of(tenant: string): Promise<Organization | null> {
    return this.organization.isAddressedBy(tenant) ? this.organization : null;
  }
}

export interface CalendarTesting {
  readonly providers: Provider[];
  readonly imports: [
    typeof EventsInfrastructureModule,
    ReturnType<typeof DatabaseModule.forFeature>,
  ];
}

export const calendarTesting = (): CalendarTesting => {
  return {
    providers: [
      CalendarAttendees,
      UserProvisioning,
      { provide: TenantOrganizations, useValue: new StubTenantOrganizations() },
      { provide: TeamRepository, useClass: MikroOrmTeamRepository },
      { provide: TeamMemberRepository, useClass: MikroOrmTeamMemberRepository },
    ],
    imports: [
      EventsInfrastructureModule,
      DatabaseModule.forFeature([
        AuthUserEntitySchema,
        OrganizationEntitySchema,
        TeamEntitySchema,
        TeamMemberEntitySchema,
      ]),
    ],
  };
};

export async function givenATeam(
  module: TestingModule,
  members: readonly UserId[] = [],
  organization: Organization = anOrganization(),
): Promise<Team> {
  const em = freshEm(module);
  const existing = await em.findOne(Organization, { id: organization.id });
  if (!existing) {
    em.persist(organization);
  }
  const team = Object.assign(new Team(), {
    id: TeamId.parse(`team_${UserId.generate().value}`),
    name: TeamName.parse('Design'),
    organization: existing ?? organization,
    memberCount: members.length,
    createdAt: T0,
  });
  em.persist(team);
  for (const userId of members) {
    const user =
      (await em.findOne(User, { id: userId })) ?? givenACredential(em, userId);
    em.persist(
      Object.assign(new TeamMember(), {
        id: TeamMemberId.parse(`team_member_${UserId.generate().value}`),
        team,
        user,
        createdAt: T0,
      }),
    );
  }
  await em.flush();
  return team;
}

export async function givenAMember(
  module: TestingModule,
  email: string,
  name: string,
): Promise<AuthUser> {
  const em = freshEm(module);
  const member = givenACredential(em, UserId.generate(), email, name);
  await em.flush();
  return member;
}

function givenACredential(
  em: EntityManager,
  id: UserId,
  email = `${id.value}@example.com`,
  name = 'member',
): AuthUser {
  const credential = Object.assign(new AuthUser(), {
    id,
    name: UserName.parse(name),
    email: Email.parse(email),
    emailVerified: true,
    createdAt: T0,
    updatedAt: T0,
  });
  em.persist(credential);
  return credential;
}

export async function givenAnEvent(
  module: TestingModule,
  responsible: User,
  participants: readonly User[] = [],
  team: Team | null = null,
  window = {
    startDate: new Date('2026-10-01T09:00:00.000Z'),
    endDate: new Date('2026-10-01T10:00:00.000Z'),
  },
): Promise<CalendarEvent> {
  const em = freshEm(module);
  const event = CalendarEvent.schedule(
    CalendarEventId.generate(),
    CalendarEventDetails.parse({
      title: 'Planning',
      description: 'Sprint planning',
      color: 'green',
    }),
    CalendarEventWindow.between(window.startDate, window.endDate),
    {
      responsible: await em.findOneOrFail(User, { id: responsible.id }),
      participants: await Promise.all(
        participants.map((user) => em.findOneOrFail(User, { id: user.id })),
      ),
      team: team && (await em.findOneOrFail(Team, { id: team.id })),
    },
    T0,
  );
  event.uncommit();
  await em.persist(event).flush();
  return event;
}
