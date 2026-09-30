import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';
import { z } from 'zod';

import { SecurityIdentitySchema } from './security-identity.schema';

export const UserIdentitySchema = SecurityIdentitySchema.extend({
  kind: z.literal('user').default('user'),
  userId: UserId.field(),
  email: Email.field(),
  name: UserName.field(),
});
