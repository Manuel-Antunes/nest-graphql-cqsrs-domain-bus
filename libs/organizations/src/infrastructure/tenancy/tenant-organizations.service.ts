import { Injectable } from '@nestjs/common';
import { Tenant } from '@nestposts/database';

import type { Organization } from '../../domain/organization/organization.entity';
import { OrganizationRepository } from '../../domain/organization/organization.repository';
import { OrganizationSlug } from '../../domain/organization/vo/organization-slug';

@Injectable()
export class TenantOrganizations {
  constructor(private readonly organizations: OrganizationRepository) {}

  async of(tenant: string): Promise<Organization | null> {
    if (Tenant.isRoot(tenant)) {
      return null;
    }
    const slug = OrganizationSlug.safeParse(tenant);
    return slug.success ? this.organizations.findBySlug(slug.data) : null;
  }
}
