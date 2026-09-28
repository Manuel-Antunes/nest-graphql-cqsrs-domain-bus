import type { CustomDecorator } from '@nestjs/common';
import {
  MemberHasPermission as BetterAuthMemberHasPermission,
  OrgRoles as BetterAuthOrgRoles,
} from '@thallesp/nestjs-better-auth';

import type { OrganizationRole } from '../domain/organization/schemas/member-role.schema';

export const OrgRoles = BetterAuthOrgRoles as (
  roles: `${OrganizationRole}`[],
) => CustomDecorator;

export const MemberCan = BetterAuthMemberHasPermission;
