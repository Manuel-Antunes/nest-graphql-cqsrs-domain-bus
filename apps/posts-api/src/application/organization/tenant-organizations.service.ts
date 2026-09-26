import { Injectable } from '@nestjs/common';
import { Tenant } from '@nestposts/database';
import type { Organization } from '@nestposts/organizations/domain/organization/organization.entity';
import { OrganizationRepository } from '@nestposts/organizations/domain/organization/organization.repository';
import { OrganizationSlug } from '@nestposts/organizations/domain/organization/vo/organization-slug';

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
