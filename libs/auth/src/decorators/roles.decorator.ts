import type { CustomDecorator } from '@nestjs/common';
import type { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import {
  Roles as BetterAuthRoles,
  UserHasPermission as BetterAuthUserHasPermission,
} from '@thallesp/nestjs-better-auth';

import type { SystemRole } from '../domain/auth/roles';

export type ApplicationRole = SystemRole | typeof AUTHOR_ROLE;

export const Roles = BetterAuthRoles as (
  roles: ApplicationRole[],
) => CustomDecorator;

export const UserCan = BetterAuthUserHasPermission;
