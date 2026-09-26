import { Injectable } from '@nestjs/common';
import { TeamNotFoundException } from '@nestposts/organizations/domain/organization/exception/team-not-found.exception';
import type { Team } from '@nestposts/organizations/domain/organization/team.entity';
import { TeamRepository } from '@nestposts/organizations/domain/organization/team.repository';
import { TeamMemberRepository } from '@nestposts/organizations/domain/organization/team-member.repository';
import type { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';
import { UserNotFoundException } from '@nestposts/users/domain/user/exception/user-not-found.exception';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserRepository } from '@nestposts/users/domain/user/user.repository';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { TenantOrganizations } from '../organization/tenant-organizations.service';
import { UserProvisioning } from '../user/user-provisioning.service';

@Injectable()
export class CalendarAttendees {
  constructor(
    private readonly users: UserRepository,
    private readonly teams: TeamRepository,
    private readonly teamMembers: TeamMemberRepository,
    private readonly tenants: TenantOrganizations,
    private readonly provisioning: UserProvisioning,
  ) {}

  async user(userId: UserId): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UserNotFoundException(userId);
    }
    return user;
  }

  async usersOf(userIds: readonly UserId[]): Promise<User[]> {
    const users: User[] = [];
    for (const userId of userIds) {
      users.push(await this.user(userId));
    }
    return users;
  }

  async team(teamId: TeamId, tenant: string): Promise<Team> {
    const organization = await this.tenants.of(tenant);
    const team = organization && (await this.teams.findById(teamId));
    if (!organization || !team?.belongsTo(organization.id)) {
      throw new TeamNotFoundException(teamId);
    }
    return team;
  }

  async membersOf(team: Team): Promise<User[]> {
    const users: User[] = [];
    for (const member of await this.teamMembers.findAllIn(team.id)) {
      users.push(await this.provisioning.provision(member.user.id));
    }
    return users;
  }
}
