import {
  defineEntity,
  p,
  SYSTEM_SCHEMA,
  valueObjectType,
} from '@nestposts/database';

import { TEAM_ID_MAX_LENGTH } from '../../../domain/organization/schemas/team-id.schema';
import { TEAM_NAME_MAX_LENGTH } from '../../../domain/organization/schemas/team-name.schema';
import { Team } from '../../../domain/organization/team.entity';
import { TeamId } from '../../../domain/organization/vo/team-id';
import { TeamName } from '../../../domain/organization/vo/team-name';
import { OrganizationEntitySchema } from './organization-orm.entity';

export const TeamIdType = valueObjectType(TeamId, {
  columnType: `varchar(${TEAM_ID_MAX_LENGTH})`,
});

const TeamNameType = valueObjectType(TeamName, {
  columnType: `varchar(${TEAM_NAME_MAX_LENGTH})`,
});

export const TeamEntitySchema = defineEntity({
  class: Team,
  tableName: 'team',
  schema: SYSTEM_SCHEMA,
  forceConstructor: true,
  properties: {
    id: p.type(TeamIdType).primary(),
    name: p.type(TeamNameType),
    memberCount: p.integer(),
    organization: () =>
      p.manyToOne(OrganizationEntitySchema).ref().deleteRule('cascade'),
    createdAt: p.datetime(),
    updatedAt: p.datetime().nullable(),
  },
  indexes: [{ properties: ['organization'] }],
});
