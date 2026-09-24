import { defineEntity, p, valueObjectType } from '@nestposts/database';
import { CREDENTIAL_ID_MAX_LENGTH } from '@nestposts/users/domain/user/schemas/credential-id.schema';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';

import { AuthUser } from '../../../domain/auth/auth-user.entity';

export const CredentialIdType = valueObjectType(CredentialId, {
  columnType: `varchar(${CREDENTIAL_ID_MAX_LENGTH})`,
});

const EmailType = valueObjectType(Email, { columnType: 'varchar(320)' });

const UserNameType = valueObjectType(UserName, { columnType: 'varchar(100)' });

export const AuthUserEntitySchema = defineEntity({
  class: AuthUser,
  tableName: 'auth_user',
  forceConstructor: true,
  properties: {
    id: p.type(CredentialIdType).primary(),
    name: p.type(UserNameType),
    email: p.type(EmailType).unique(),
    emailVerified: p.boolean(),
    image: p.string().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
    role: p.string().nullable(),
    banned: p.boolean().nullable(),
    banReason: p.text().nullable(),
    banExpires: p.datetime().nullable(),
    twoFactorEnabled: p.boolean().nullable().default(false),
  },
});
