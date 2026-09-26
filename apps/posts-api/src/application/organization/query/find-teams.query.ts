import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { Team } from '@nestposts/organizations/domain/organization/team.entity';
import { TeamRepository } from '@nestposts/organizations/domain/organization/team.repository';

import { TenantOrganizations } from '../tenant-organizations.service';

export namespace FindTeamsQuery {
  export class FindTeams extends Query<Team[]> {
    constructor(readonly tenant: string) {
      super();
    }
  }

  @QueryHandler(FindTeams)
  export class Handler implements IQueryHandler<FindTeams> {
    constructor(
      private readonly tenants: TenantOrganizations,
      private readonly teams: TeamRepository,
    ) {}

    async execute({ tenant }: FindTeams): Promise<Team[]> {
      const organization = await this.tenants.of(tenant);
      return organization ? this.teams.findAllIn(organization.id) : [];
    }
  }
}
