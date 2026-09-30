import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { Team } from '@nestposts/organizations/domain/organization/team.entity';
import { TeamRepository } from '@nestposts/organizations/domain/organization/team.repository';
import type { TeamId } from '@nestposts/organizations/domain/organization/vo/team-id';

export namespace FindTeamQuery {
  export class FindTeam extends Query<Team | null> {
    constructor(readonly teamId: TeamId) {
      super();
    }
  }

  @QueryHandler(FindTeam)
  export class Handler implements IQueryHandler<FindTeam> {
    constructor(private readonly teams: TeamRepository) {}

    execute({ teamId }: FindTeam): Promise<Team | null> {
      return this.teams.findById(teamId);
    }
  }
}
