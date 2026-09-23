import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';

import type { Organization } from './organization.entity';
import type { OrganizationId } from './vo/organization-id';
import type { OrganizationSlug } from './vo/organization-slug';

export abstract class OrganizationRepository {
  abstract findById(
    organizationId: OrganizationId,
  ): Promise<Organization | null>;

  abstract findBySlug(slug: OrganizationSlug): Promise<Organization | null>;

  abstract findAllOf(credentialId: CredentialId): Promise<Organization[]>;
}
