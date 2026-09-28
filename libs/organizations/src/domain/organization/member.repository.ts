import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { Member } from './member.entity';
import type { MemberId } from './vo/member-id';
import type { OrganizationId } from './vo/organization-id';

export abstract class MemberRepository {
  abstract findById(memberId: MemberId): Promise<Member | null>;

  abstract findIn(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<Member | null>;

  abstract findAllIn(organizationId: OrganizationId): Promise<Member[]>;

  abstract findAllOf(userId: UserId): Promise<Member[]>;
}
