import { AuthUserEntitySchema } from '@nestposts/auth/infrastructure/persistence/entities/auth-user-orm.entity';
import { defineEntity, p, valueObjectType } from '@nestposts/database';
import { Email } from '@nestposts/users/domain/user/vo/email';

import { Invitation } from '../../../domain/organization/invitation.entity';
import { INVITATION_ID_MAX_LENGTH } from '../../../domain/organization/schemas/invitation-id.schema';
import { INVITATION_STATUS_MAX_LENGTH } from '../../../domain/organization/schemas/invitation-status.schema';
import { InvitationId } from '../../../domain/organization/vo/invitation-id';
import { InvitationStatus } from '../../../domain/organization/vo/invitation-status';
import { MemberRoleType } from './member-orm.entity';
import { OrganizationEntitySchema } from './organization-orm.entity';

const InvitationIdType = valueObjectType(InvitationId, {
  columnType: `varchar(${INVITATION_ID_MAX_LENGTH})`,
});

const InvitationStatusType = valueObjectType(InvitationStatus, {
  columnType: `varchar(${INVITATION_STATUS_MAX_LENGTH})`,
});

const EmailType = valueObjectType(Email, { columnType: 'varchar(320)' });

export const InvitationEntitySchema = defineEntity({
  class: Invitation,
  tableName: 'invitation',
  forceConstructor: true,
  properties: {
    id: p.type(InvitationIdType).primary(),
    organization: () => p.manyToOne(OrganizationEntitySchema).ref(),
    email: p.type(EmailType),
    role: p.type(MemberRoleType).nullable(),
    status: p.type(InvitationStatusType),
    expiresAt: p.datetime(),
    createdAt: p.datetime(),
    inviter: () => p.manyToOne(AuthUserEntitySchema).ref(),
    teamId: p.string().length(64).nullable(),
  },
  indexes: [{ properties: ['email'] }],
});
