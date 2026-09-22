import { Injectable, type PipeTransform, Scope } from '@nestjs/common';
import { OrganizationNotSelectedException } from '@nestposts/organizations/domain/organization/exception/organization-not-selected.exception';
import type { Organization } from '@nestposts/organizations/domain/organization/organization.entity';
import { OrganizationService } from '@nestposts/organizations/domain/organization/organization.service';

@Injectable({ scope: Scope.REQUEST })
export class ActiveOrganizationPipe implements PipeTransform<unknown, Promise<Organization>> {
  constructor(private readonly organizations: OrganizationService) {}

  async transform(): Promise<Organization> {
    const organization = await this.organizations.activeOrganization();
    if (!organization) {
      throw new OrganizationNotSelectedException();
    }
    return organization;
  }
}
