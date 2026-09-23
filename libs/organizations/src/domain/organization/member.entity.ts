import type { Ref } from '@mikro-orm/core';
import { BaseEntity } from '@mikro-orm/core';
import type { AuthUser } from '@nestposts/auth/domain/auth/auth-user.entity';
import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';

import type { Organization } from './organization.entity';
import {
  ORGANIZATION_ADMIN_ROLE,
  OWNER_ROLE,
} from './schemas/member-role.schema';
import { MemberId } from './vo/member-id';
import { MemberRole } from './vo/member-role';
import type { OrganizationId } from './vo/organization-id';

export class Member extends BaseEntity {
  id!: MemberId;

  organization!: Ref<Organization>;

  user!: Ref<AuthUser>;

  role!: MemberRole;

  createdAt!: Date;

  hasRole(role: MemberRole | string): boolean {
    return this.role.equals(role);
  }

  isOwner(): boolean {
    return this.hasRole(OWNER_ROLE);
  }

  isAdmin(): boolean {
    return this.isOwner() || this.hasRole(ORGANIZATION_ADMIN_ROLE);
  }

  belongsTo(organizationId: OrganizationId | string): boolean {
    return this.organization.id.equals(organizationId);
  }

  identifies(credentialId: CredentialId | string): boolean {
    return this.user.id.equals(credentialId);
  }
}
