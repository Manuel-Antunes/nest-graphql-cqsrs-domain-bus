import type { TeamMember } from './team-member.entity';
import type { TeamId } from './vo/team-id';

export abstract class TeamMemberRepository {
  abstract findAllIn(teamId: TeamId): Promise<TeamMember[]>;
}
