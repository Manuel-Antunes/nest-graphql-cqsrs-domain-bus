import {
  defineEntity,
  p,
  SYSTEM_SCHEMA,
  TENANT_SCHEMA,
  valueObjectType,
} from '@nestposts/database';
import { ZodEntity } from '@nestposts/platform/domain/shared/zod-entity';
import { referencesServeDelegations } from '@nestposts/platform/infrastructure/persistence/delegation/delegated-reference';
import {
  activeFilter,
  activeThrough,
  softDeleteIndex,
  softDeleteProperty,
} from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete-orm.entity';

import { Authorship } from '../../../domain/user/author.entity';
import { InvalidUserException } from '../../../domain/user/exception/invalid-user.exception';
import { UserSchema } from '../../../domain/user/schemas/user.schema';
import { USER_ID_MAX_LENGTH } from '../../../domain/user/schemas/user-id.schema';
import { User } from '../../../domain/user/user.entity';
import { Email } from '../../../domain/user/vo/email';
import { UserId } from '../../../domain/user/vo/user-id';
import { UserName } from '../../../domain/user/vo/user-name';
import { UserChatwootSyncTrigger } from '../triggers/chatwoot-sync.trigger';

export const USER_KIND = 'user';

export const UserEntitySchema = defineEntity({
  class: User,
  tableName: 'users',
  schema: SYSTEM_SCHEMA,
  abstract: true,
  discriminatorColumn: 'kind',
  forceConstructor: true,
  properties: {
    id: p
      .type(
        valueObjectType(UserId, {
          columnType: `varchar(${USER_ID_MAX_LENGTH})`,
        }),
      )
      .primary(),
    email: p.type(valueObjectType(Email, { columnType: 'varchar(320)' })),
    name: p.type(valueObjectType(UserName, { columnType: 'varchar(100)' })),
    role: p.string().nullable(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
    version: p.integer().default(1),
    deleted: () => softDeleteProperty(),
    kind: p.string().default(USER_KIND),
  },
  filters: activeFilter,
  uniques: [
    {
      name: 'users_email_unique',
      properties: ['email'],
      where: '"deleted_at" is null',
    },
  ],
  indexes: [softDeleteIndex],
  triggers: [UserChatwootSyncTrigger],
});

export const AuthorshipEntitySchema = defineEntity({
  class: Authorship,
  tableName: 'authors',
  schema: TENANT_SCHEMA,
  forceConstructor: true,
  properties: {
    user: () =>
      p.oneToOne(UserEntitySchema).ref().primary().eager().fieldName('id'),
  },
  filters: activeThrough('user'),
});

referencesServeDelegations();

ZodEntity(
  User,
  UserSchema,
  (error) => new InvalidUserException('user inválido', { cause: error }),
);
