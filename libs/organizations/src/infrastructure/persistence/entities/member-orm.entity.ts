import { AuthUserEntitySchema } from '@nestposts/auth/infrastructure/persistence/entities/auth-user-orm.entity';
import {
  defineEntity,
  p,
  SYSTEM_SCHEMA,
  valueObjectType,
} from '@nestposts/database';

import { Member } from '../../../domain/organization/member.entity';
import { MEMBER_ID_MAX_LENGTH } from '../../../domain/organization/schemas/member-id.schema';
import { MEMBER_ROLE_MAX_LENGTH } from '../../../domain/organization/schemas/member-role.schema';
import { MemberId } from '../../../domain/organization/vo/member-id';
import { MemberRole } from '../../../domain/organization/vo/member-role';
import { MemberChatwootSyncTrigger } from '../triggers/chatwoot-sync.triggers';
import { OrganizationEntitySchema } from './organization-orm.entity';

export const MemberEntitySchema = defineEntity({
  class: Member,
  tableName: 'member',
  schema: SYSTEM_SCHEMA,
  forceConstructor: true,
  properties: {
    id: p
      .type(
        valueObjectType(MemberId, {
          columnType: `varchar(${MEMBER_ID_MAX_LENGTH})`,
        }),
      )
      .primary(),
    organization: () => p.manyToOne(OrganizationEntitySchema).ref(),
    user: () => p.manyToOne(AuthUserEntitySchema).ref(),
    role: p.type(
      valueObjectType(MemberRole, {
        columnType: `varchar(${MEMBER_ROLE_MAX_LENGTH})`,
      }),
    ),
    createdAt: p.datetime(),
  },
  indexes: [{ properties: ['organization', 'user'] }],
  triggers: [MemberChatwootSyncTrigger],
});
