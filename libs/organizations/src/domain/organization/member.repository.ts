import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';

import type { Member } from './member.entity';
import type { MemberId } from './vo/member-id';
import type { OrganizationId } from './vo/organization-id';

export abstract class MemberRepository {
  abstract findById(memberId: MemberId): Promise<Member | null>;

  abstract findIn(
    organizationId: OrganizationId,
    credentialId: CredentialId,
  ): Promise<Member | null>;

  abstract findAllIn(organizationId: OrganizationId): Promise<Member[]>;

  abstract findAllOf(credentialId: CredentialId): Promise<Member[]>;
}
