import { defineEntity, p, SYSTEM_SCHEMA } from '@nestposts/database';
import {
  USER_KIND,
  UserEntitySchema,
} from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

import { AuthUser } from '../../../domain/auth/auth-user.entity';

export const AuthUserEntitySchema = defineEntity({
  class: AuthUser,
  extends: UserEntitySchema,
  schema: SYSTEM_SCHEMA,
  discriminatorValue: USER_KIND,
  forceConstructor: true,
  properties: {
    emailVerified: p.boolean().default(false),
    image: p.string().nullable(),
    banned: p.boolean().nullable(),
    banReason: p.text().nullable(),
    banExpires: p.datetime().nullable(),
    twoFactorEnabled: p.boolean().nullable().default(false),
  },
});
