import { MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Query, Resolver } from '@nestjs/graphql';
import { CurrentUser } from '@nestposts/auth/decorators/current-user.decorator';
import { CurrentTenant } from '@nestposts/database';
import { Team } from '@nestposts/organizations/domain/organization/team.entity';
import type { User } from '@nestposts/users/domain/user/user.entity';

import { FindMembersQuery } from '../../application/organization/query/find-members.query';
import { FindTeamsQuery } from '../../application/organization/query/find-teams.query';
import { TeamView } from '../../dto/graphql/team.view';
import { UserViewInterceptor } from '../interceptors/user-view.interceptor';

@Resolver()
export class OrganizationQueryResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @Query('members')
  @UseInterceptors(UserViewInterceptor)
  members(
    @CurrentUser() caller: User,
    @CurrentTenant() tenant: string,
  ): Promise<User[]> {
    return this.queryBus.execute(
      new FindMembersQuery.FindMembers(caller, tenant),
    );
  }

  @Query('teams')
  @UseInterceptors(MapInterceptor(Team, TeamView, { isArray: true }))
  teams(@CurrentTenant() tenant: string): Promise<Team[]> {
    return this.queryBus.execute(new FindTeamsQuery.FindTeams(tenant));
  }
}
