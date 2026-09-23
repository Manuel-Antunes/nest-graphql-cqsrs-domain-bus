import type { Email } from '@nestposts/users/domain/user/vo/email';

import type { Invitation } from './invitation.entity';
import type { InvitationId } from './vo/invitation-id';
import type { OrganizationId } from './vo/organization-id';

export abstract class InvitationRepository {
  abstract findById(invitationId: InvitationId): Promise<Invitation | null>;

  abstract findOpenFor(email: Email, now: Date): Promise<Invitation[]>;

  abstract findAllIn(organizationId: OrganizationId): Promise<Invitation[]>;
}
