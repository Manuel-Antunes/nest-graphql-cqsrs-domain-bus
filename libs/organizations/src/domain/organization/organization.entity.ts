import { BaseEntity } from '@mikro-orm/core';

import { OrganizationId } from './vo/organization-id';
import { OrganizationName } from './vo/organization-name';
import { OrganizationSlug } from './vo/organization-slug';

export class Organization extends BaseEntity {
  id!: OrganizationId;

  name!: OrganizationName;

  slug!: OrganizationSlug;

  logo: string | null = null;

  metadata: string | null = null;

  createdAt!: Date;

  is(organizationId: OrganizationId | string): boolean {
    return this.id.equals(organizationId);
  }

  isAddressedBy(slug: OrganizationSlug | string): boolean {
    return this.slug.equals(slug);
  }
}
