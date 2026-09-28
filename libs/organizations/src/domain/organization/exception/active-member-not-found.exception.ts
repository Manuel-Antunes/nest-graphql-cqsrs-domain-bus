import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { OrganizationId } from '../vo/organization-id';

export class ActiveMemberNotFoundException extends Error {
  constructor(
    readonly userId: UserId,
    readonly organizationId: OrganizationId,
  ) {
    super(
      `user ${userId} holds no membership in organization ${organizationId}`,
    );
    this.name = 'ActiveMemberNotFoundException';
  }
}
