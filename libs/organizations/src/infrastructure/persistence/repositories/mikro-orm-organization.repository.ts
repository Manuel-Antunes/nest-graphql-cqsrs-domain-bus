import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';
import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { Member } from '../../../domain/organization/member.entity';
import { Organization } from '../../../domain/organization/organization.entity';
import { OrganizationRepository } from '../../../domain/organization/organization.repository';
import type { OrganizationId } from '../../../domain/organization/vo/organization-id';
import type { OrganizationSlug } from '../../../domain/organization/vo/organization-slug';

@Injectable()
export class MikroOrmOrganizationRepository extends OrganizationRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  findById(organizationId: OrganizationId): Promise<Organization | null> {
    return inRequestContext(this.em, () => this.em.findOne(Organization, { id: organizationId }));
  }

  findBySlug(slug: OrganizationSlug): Promise<Organization | null> {
    return inRequestContext(this.em, () => this.em.findOne(Organization, { slug }));
  }

  findAllOf(credentialId: CredentialId): Promise<Organization[]> {
    return inRequestContext(this.em, async () => {
      const memberships = await this.em.find(
        Member,
        { user: credentialId },
        { populate: ['organization'], orderBy: { createdAt: 'asc' } },
      );
      return memberships.map((membership) => membership.organization.getEntity());
    });
  }
}
