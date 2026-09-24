import type { Ref } from '@mikro-orm/core';
import { BaseEntity } from '@mikro-orm/core';
import type { AuthUser } from '@nestposts/auth/domain/auth/auth-user.entity';
import { Email } from '@nestposts/users/domain/user/vo/email';

import type { Organization } from './organization.entity';
import { InvitationId } from './vo/invitation-id';
import { InvitationStatus } from './vo/invitation-status';
import { MemberRole } from './vo/member-role';
import type { OrganizationId } from './vo/organization-id';

export class Invitation extends BaseEntity {
  id!: InvitationId;

  organization!: Ref<Organization>;

  email!: Email;

  role: MemberRole | null = null;

  status!: InvitationStatus;

  expiresAt!: Date;

  createdAt!: Date;

  inviter!: Ref<AuthUser>;

  teamId: string | null = null;

  belongsTo(organizationId: OrganizationId | string): boolean {
    return this.organization.id.equals(organizationId);
  }

  wasSentTo(email: Email): boolean {
    return this.email.equals(email);
  }

  isOpen(now: Date): boolean {
    return this.status.isPending() && this.expiresAt.getTime() > now.getTime();
  }

  hasExpired(now: Date): boolean {
    return this.status.isPending() && this.expiresAt.getTime() <= now.getTime();
  }
}
