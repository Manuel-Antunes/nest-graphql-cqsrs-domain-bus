import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';

import { Team } from '../../../domain/organization/team.entity';
import { TeamRepository } from '../../../domain/organization/team.repository';
import type { OrganizationId } from '../../../domain/organization/vo/organization-id';
import type { TeamId } from '../../../domain/organization/vo/team-id';

@Injectable()
export class MikroOrmTeamRepository extends TeamRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  findById(teamId: TeamId): Promise<Team | null> {
    return inRequestContext(this.em, () =>
      this.em.findOne(Team, { id: teamId }),
    );
  }

  findAllIn(organizationId: OrganizationId): Promise<Team[]> {
    return inRequestContext(this.em, () =>
      this.em.find(
        Team,
        { organization: organizationId },
        { orderBy: { name: 'asc', id: 'asc' } },
      ),
    );
  }
}
