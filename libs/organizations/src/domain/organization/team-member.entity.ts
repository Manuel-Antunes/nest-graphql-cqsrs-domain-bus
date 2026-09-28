import type { Ref } from '@mikro-orm/core';
import { BaseEntity } from '@mikro-orm/core';
import type { AuthUser } from '@nestposts/auth/domain/auth/auth-user.entity';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { Team } from './team.entity';
import { TeamMemberId } from './vo/team-member-id';

export class TeamMember extends BaseEntity {
  id!: TeamMemberId;

  team!: Ref<Team>;

  user!: Ref<AuthUser>;

  membershipKey: string | null = null;

  createdAt: Date | null = null;

  identifies(userId: UserId | string): boolean {
    return this.user.id.equals(userId);
  }
}
