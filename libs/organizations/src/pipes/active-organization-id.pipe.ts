import type { PipeTransform } from '@nestjs/common';
import { Injectable, Scope } from '@nestjs/common';

import { OrganizationNotSelectedException } from '../domain/organization/exception/organization-not-selected.exception';
import { OrganizationService } from '../domain/organization/organization.service';
import type { OrganizationId } from '../domain/organization/vo/organization-id';

@Injectable({ scope: Scope.REQUEST })
export class ActiveOrganizationIdPipe
  implements PipeTransform<unknown, Promise<OrganizationId>>
{
  constructor(private readonly organizations: OrganizationService) {}

  async transform(): Promise<OrganizationId> {
    const organizationId = await this.organizations.activeOrganizationId();
    if (!organizationId) {
      throw new OrganizationNotSelectedException();
    }
    return organizationId;
  }
}
