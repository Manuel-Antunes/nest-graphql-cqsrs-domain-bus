import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';

import { TeamMember } from '../../../domain/organization/team-member.entity';
import { TeamMemberRepository } from '../../../domain/organization/team-member.repository';
import type { TeamId } from '../../../domain/organization/vo/team-id';

@Injectable()
export class MikroOrmTeamMemberRepository extends TeamMemberRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  findAllIn(teamId: TeamId): Promise<TeamMember[]> {
    return inRequestContext(this.em, () =>
      this.em.find(
        TeamMember,
        { team: teamId },
        { orderBy: { createdAt: 'asc', id: 'asc' } },
      ),
    );
  }
}
