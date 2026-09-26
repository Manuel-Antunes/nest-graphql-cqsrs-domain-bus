import type { Team } from './team.entity';
import type { OrganizationId } from './vo/organization-id';
import type { TeamId } from './vo/team-id';

export abstract class TeamRepository {
  abstract findById(teamId: TeamId): Promise<Team | null>;
  abstract findAllIn(organizationId: OrganizationId): Promise<Team[]>;
}
