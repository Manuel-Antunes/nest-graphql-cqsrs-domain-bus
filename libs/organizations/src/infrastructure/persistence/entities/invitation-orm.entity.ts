import { AuthUserEntitySchema } from '@nestposts/auth/infrastructure/persistence/entities/auth-user-orm.entity';
import {
  defineEntity,
  p,
  SYSTEM_SCHEMA,
  valueObjectType,
} from '@nestposts/database';
import { Email } from '@nestposts/users/domain/user/vo/email';

import { Invitation } from '../../../domain/organization/invitation.entity';
import { INVITATION_ID_MAX_LENGTH } from '../../../domain/organization/schemas/invitation-id.schema';
import { INVITATION_STATUS_MAX_LENGTH } from '../../../domain/organization/schemas/invitation-status.schema';
import { MEMBER_ROLE_MAX_LENGTH } from '../../../domain/organization/schemas/member-role.schema';
import { InvitationId } from '../../../domain/organization/vo/invitation-id';
import { InvitationStatus } from '../../../domain/organization/vo/invitation-status';
import { MemberRole } from '../../../domain/organization/vo/member-role';
import { OrganizationEntitySchema } from './organization-orm.entity';

export const InvitationEntitySchema = defineEntity({
  class: Invitation,
  tableName: 'invitation',
  schema: SYSTEM_SCHEMA,
  forceConstructor: true,
  properties: {
    id: p
      .type(
        valueObjectType(InvitationId, {
          columnType: `varchar(${INVITATION_ID_MAX_LENGTH})`,
        }),
      )
      .primary(),
    organization: () => p.manyToOne(OrganizationEntitySchema).ref(),
    email: p.type(valueObjectType(Email, { columnType: 'varchar(320)' })),
    role: p
      .type(
        valueObjectType(MemberRole, {
          columnType: `varchar(${MEMBER_ROLE_MAX_LENGTH})`,
        }),
      )
      .nullable(),
    status: p.type(
      valueObjectType(InvitationStatus, {
        columnType: `varchar(${INVITATION_STATUS_MAX_LENGTH})`,
      }),
    ),
    expiresAt: p.datetime(),
    createdAt: p.datetime(),
    inviter: () => p.manyToOne(AuthUserEntitySchema).ref(),
    teamId: p.string().length(64).nullable(),
  },
  indexes: [{ properties: ['email'] }],
});
