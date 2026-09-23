import type { Email } from '@nestposts/users/domain/user/vo/email';
import type { UserName } from '@nestposts/users/domain/user/vo/user-name';

import type { InvitationId } from './vo/invitation-id';
import type { MemberRole } from './vo/member-role';
import type { OrganizationName } from './vo/organization-name';

export interface InvitationNotice {
  readonly invitationId: InvitationId;
  readonly email: Email;
  readonly role: MemberRole | null;
  readonly organization: OrganizationName;
  readonly invitedBy: UserName;
  readonly acceptUrl: string;
}

export abstract class InvitationNotifier {
  abstract invited(notice: InvitationNotice): Promise<void>;
}
