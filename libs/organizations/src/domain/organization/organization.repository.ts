import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { Organization } from './organization.entity';
import type { OrganizationId } from './vo/organization-id';
import type { OrganizationSlug } from './vo/organization-slug';

export abstract class OrganizationRepository {
  abstract findById(
    organizationId: OrganizationId,
  ): Promise<Organization | null>;

  abstract findBySlug(slug: OrganizationSlug): Promise<Organization | null>;

  abstract findAllOf(userId: UserId): Promise<Organization[]>;
}
