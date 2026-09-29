import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';
import { z } from 'zod';

export const IdentitySchema = z.object({
  userId: UserId.field(),
  email: Email.field(),
  name: UserName.field(),
  roles: z.array(z.string().trim().min(1)).readonly(),
  scopes: z.array(z.string().trim().min(1)).readonly(),
  activeOrganizationId: z
    .string()
    .min(1)
    .nullish()
    .transform((organizationId) => organizationId ?? null),
});
