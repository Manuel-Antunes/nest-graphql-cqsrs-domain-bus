import { AuthUserEntitySchema } from '@nestposts/auth/infrastructure/persistence/entities/auth-user-orm.entity';
import {
  defineEntity,
  p,
  SYSTEM_SCHEMA,
  valueObjectType,
} from '@nestposts/database';

import { TEAM_MEMBER_ID_MAX_LENGTH } from '../../../domain/organization/schemas/team-member-id.schema';
import { TeamMember } from '../../../domain/organization/team-member.entity';
import { TeamMemberId } from '../../../domain/organization/vo/team-member-id';
import { TeamMemberChatwootSyncTrigger } from '../triggers/chatwoot-sync.triggers';
import { TeamEntitySchema } from './team-orm.entity';

const TeamMemberIdType = valueObjectType(TeamMemberId, {
  columnType: `varchar(${TEAM_MEMBER_ID_MAX_LENGTH})`,
});

export const TeamMemberEntitySchema = defineEntity({
  class: TeamMember,
  tableName: 'team_member',
  schema: SYSTEM_SCHEMA,
  forceConstructor: true,
  properties: {
    id: p.type(TeamMemberIdType).primary(),
    team: () => p.manyToOne(TeamEntitySchema).ref().deleteRule('cascade'),
    user: () => p.manyToOne(AuthUserEntitySchema).ref().deleteRule('cascade'),
    membershipKey: p.text().nullable().unique(),
    createdAt: p.datetime().nullable(),
  },
  indexes: [{ properties: ['team'] }, { properties: ['user'] }],
  triggers: [TeamMemberChatwootSyncTrigger],
});
