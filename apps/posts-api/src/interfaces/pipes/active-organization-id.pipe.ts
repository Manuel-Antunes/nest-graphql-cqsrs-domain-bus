import type { PipeTransform } from '@nestjs/common';
import type { OrganizationId } from '@nestposts/organizations/domain/organization/vo/organization-id';
import { Injectable, Scope } from '@nestjs/common';
import { OrganizationNotSelectedException } from '@nestposts/organizations/domain/organization/exception/organization-not-selected.exception';
import { OrganizationService } from '@nestposts/organizations/domain/organization/organization.service';

@Injectable({ scope: Scope.REQUEST })
export class ActiveOrganizationIdPipe implements PipeTransform<
  unknown,
  Promise<OrganizationId>
> {
  constructor(private readonly organizations: OrganizationService) {}

  async transform(): Promise<OrganizationId> {
    const organizationId = await this.organizations.activeOrganizationId();
    if (!organizationId) {
      throw new OrganizationNotSelectedException();
    }
    return organizationId;
  }
}
