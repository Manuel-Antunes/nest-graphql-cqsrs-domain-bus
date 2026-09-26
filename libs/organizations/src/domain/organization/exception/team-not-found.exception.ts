import type { TeamId } from '../vo/team-id';

export class TeamNotFoundException extends Error {
  constructor(readonly teamId: TeamId) {
    super(`team ${teamId} does not exist`);
    this.name = 'TeamNotFoundException';
  }
}
