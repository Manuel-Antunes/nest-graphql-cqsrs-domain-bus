import { Injectable } from '@nestjs/common';
import { ROOT_TENANT, Tenant } from '@nestposts/database';

import type { Organization } from '../../domain/organization/organization.entity';
import { OrganizationRepository } from '../../domain/organization/organization.repository';
import { OrganizationId } from '../../domain/organization/vo/organization-id';
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

  /**
   * The tenant an organization is — its slug — or the root tenant for no organization, or for one
   * that does not exist.
   */
  async tenantOf(organizationId: string | null | undefined): Promise<string> {
    const id = OrganizationId.safeParse(organizationId);
    if (!id.success) return ROOT_TENANT;
    const organization = await this.organizations.findById(id.data);
    return organization ? organization.slug.value : ROOT_TENANT;
  }
}
