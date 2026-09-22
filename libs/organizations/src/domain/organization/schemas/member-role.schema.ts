import { z } from 'zod';

export const OWNER_ROLE = 'owner';

export const ORGANIZATION_ADMIN_ROLE = 'admin';

export const MEMBER_ROLE = 'member';

export const ORGANIZATION_ROLES = [OWNER_ROLE, ORGANIZATION_ADMIN_ROLE, MEMBER_ROLE] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export const MEMBER_ROLE_MAX_LENGTH = 64;

export const MemberRoleSchema = z
  .string({ error: 'member role must not be empty' })
  .trim()
  .toLowerCase()
  .min(1, 'member role must not be empty')
  .max(MEMBER_ROLE_MAX_LENGTH, `member role exceeds ${MEMBER_ROLE_MAX_LENGTH} characters`)
  .brand<'MemberRole'>();
