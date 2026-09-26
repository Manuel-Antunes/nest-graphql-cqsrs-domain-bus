import type { PipeTransform } from '@nestjs/common';
import { Injectable, Scope } from '@nestjs/common';
import { OrganizationService } from '@nestposts/organizations/domain/organization/organization.service';
import { EVENT_RESOURCE } from '@nestposts/organizations/infrastructure/better-auth/access';

import { TenantOrganizations } from '../../application/organization/tenant-organizations.service';

@Injectable({ scope: Scope.REQUEST })
export class SeesEveryEventPipe
  implements PipeTransform<string, Promise<boolean>>
{
  constructor(
    private readonly tenants: TenantOrganizations,
    private readonly organizations: OrganizationService,
  ) {}

  async transform(tenant: string): Promise<boolean> {
    const organization = await this.tenants.of(tenant);
    return organization
      ? this.organizations.hasOrganizationPermission(
          { [EVENT_RESOURCE]: ['read'] },
          organization.id,
        )
      : false;
  }
}
