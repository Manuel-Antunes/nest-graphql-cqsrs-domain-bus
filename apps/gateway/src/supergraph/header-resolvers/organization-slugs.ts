import type { Cache } from '@nestjs/cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { OrganizationRepository } from '@nestposts/organizations/domain/organization/organization.repository';
import { OrganizationId } from '@nestposts/organizations/domain/organization/vo/organization-id';

@Injectable()
export class OrganizationSlugs {
  static readonly TTL_MS = 5 * 60_000;

  constructor(
    private readonly organizations: OrganizationRepository,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  static keyOf(organizationId: string): string {
    return `organization-slug:${organizationId}`;
  }

  async of(
    organizationId: string | null | undefined,
  ): Promise<string | undefined> {
    if (!organizationId) return undefined;
    const slug = await this.cache.wrap(
      OrganizationSlugs.keyOf(organizationId),
      () => this.lookup(organizationId),
      OrganizationSlugs.TTL_MS,
    );
    return slug ?? undefined;
  }

  private async lookup(organizationId: string): Promise<string | null> {
    const organization = await this.organizations.findById(
      OrganizationId.parse(organizationId),
    );
    return organization?.slug.value ?? null;
  }
}
