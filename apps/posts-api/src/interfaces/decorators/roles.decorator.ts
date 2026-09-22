import type { CustomDecorator } from '@nestjs/common';
import {
  MemberHasPermission as BetterAuthMemberHasPermission,
  OrgRoles as BetterAuthOrgRoles,
  Roles as BetterAuthRoles,
  UserHasPermission as BetterAuthUserHasPermission,
} from '@thallesp/nestjs-better-auth';
import type { OrganizationRole } from '@nestposts/organizations/domain/organization/schemas/member-role.schema';
import type { SystemRole } from '@nestposts/auth/domain/auth/roles';
import type { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';

export type ApplicationRole = SystemRole | typeof AUTHOR_ROLE;

export const Roles = BetterAuthRoles as (roles: ApplicationRole[]) => CustomDecorator;

export const OrgRoles = BetterAuthOrgRoles as (roles: `${OrganizationRole}`[]) => CustomDecorator;

export const UserCan = BetterAuthUserHasPermission;

export const MemberCan = BetterAuthMemberHasPermission;
