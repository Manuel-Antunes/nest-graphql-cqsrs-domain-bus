import { MapInterceptor } from '@automapper/nestjs';
import { UseInterceptors } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ResolveReference, Resolver } from '@nestjs/graphql';
import { Team } from '@nestposts/organizations/domain/organization/team.entity';
import { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { FindTeamQuery } from '../../application/organization/query/find-team.query';
import { TeamView } from '../../dto/graphql/team.view';
import type { EntityReference } from './entity-reference';

@AllowAnonymous()
@Resolver('Team')
export class TeamEntityResolver {
  constructor(private readonly queryBus: QueryBus) {}

  @ResolveReference()
  @UseInterceptors(MapInterceptor(Team, TeamView))
  resolveReference(reference: EntityReference): Promise<Team | null> {
    return this.queryBus.execute(
      new FindTeamQuery.FindTeam(TeamId.parse(reference.id)),
    );
  }
}
