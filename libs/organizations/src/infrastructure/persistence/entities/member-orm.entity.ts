import { defineEntity, p, valueObjectType } from '@nestposts/database';
import { Member } from '../../../domain/organization/member.entity';
import { MEMBER_ID_MAX_LENGTH } from '../../../domain/organization/schemas/member-id.schema';
import { MEMBER_ROLE_MAX_LENGTH } from '../../../domain/organization/schemas/member-role.schema';
import { MemberId } from '../../../domain/organization/vo/member-id';
import { MemberRole } from '../../../domain/organization/vo/member-role';
import { AuthUserEntitySchema } from '@nestposts/auth/infrastructure/persistence/entities/auth-user-orm.entity';
import { OrganizationEntitySchema } from './organization-orm.entity';

const MemberIdType = valueObjectType(MemberId, {
  columnType: `varchar(${MEMBER_ID_MAX_LENGTH})`,
});

export const MemberRoleType = valueObjectType(MemberRole, {
  columnType: `varchar(${MEMBER_ROLE_MAX_LENGTH})`,
});

export const MemberEntitySchema = defineEntity({
  class: Member,
  tableName: 'member',
  forceConstructor: true,
  properties: {
    id: p.type(MemberIdType).primary(),
    organization: () => p.manyToOne(OrganizationEntitySchema).ref(),
    user: () => p.manyToOne(AuthUserEntitySchema).ref(),
    role: p.type(MemberRoleType),
    createdAt: p.datetime(),
  },
  indexes: [{ properties: ['organization', 'user'] }],
});
