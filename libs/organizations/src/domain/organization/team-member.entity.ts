import type { Ref } from '@mikro-orm/core';
import { BaseEntity } from '@mikro-orm/core';
import type { AuthUser } from '@nestposts/auth/domain/auth/auth-user.entity';
import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';

import type { Team } from './team.entity';
import { TeamMemberId } from './vo/team-member-id';

export class TeamMember extends BaseEntity {
  id!: TeamMemberId;

  team!: Ref<Team>;

  user!: Ref<AuthUser>;

  membershipKey: string | null = null;

  createdAt: Date | null = null;

  identifies(credentialId: CredentialId | string): boolean {
    return this.user.id.equals(credentialId);
  }
}
