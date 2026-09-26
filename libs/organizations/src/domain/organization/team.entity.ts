import type { Ref } from '@mikro-orm/core';
import { BaseEntity } from '@mikro-orm/core';

import type { Organization } from './organization.entity';
import type { OrganizationId } from './vo/organization-id';
import { TeamId } from './vo/team-id';
import { TeamName } from './vo/team-name';

export class Team extends BaseEntity {
  id!: TeamId;

  name!: TeamName;

  organization!: Ref<Organization>;

  memberCount!: number;

  createdAt!: Date;

  updatedAt: Date | null = null;

  belongsTo(organizationId: OrganizationId | string): boolean {
    return this.organization.id.equals(organizationId);
  }
}
