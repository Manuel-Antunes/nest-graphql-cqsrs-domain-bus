import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';
import type { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { Member } from '../../../domain/organization/member.entity';
import { MemberRepository } from '../../../domain/organization/member.repository';
import type { MemberId } from '../../../domain/organization/vo/member-id';
import type { OrganizationId } from '../../../domain/organization/vo/organization-id';

@Injectable()
export class MikroOrmMemberRepository extends MemberRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  findById(memberId: MemberId): Promise<Member | null> {
    return inRequestContext(this.em, () =>
      this.em.findOne(Member, { id: memberId }, { populate: ['organization', 'user'] }),
    );
  }

  findIn(organizationId: OrganizationId, credentialId: CredentialId): Promise<Member | null> {
    return inRequestContext(this.em, () =>
      this.em.findOne(
        Member,
        { organization: organizationId, user: credentialId },
        { populate: ['organization', 'user'] },
      ),
    );
  }

  findAllIn(organizationId: OrganizationId): Promise<Member[]> {
    return inRequestContext(this.em, () =>
      this.em.find(
        Member,
        { organization: organizationId },
        { populate: ['user'], orderBy: { createdAt: 'asc' } },
      ),
    );
  }

  findAllOf(credentialId: CredentialId): Promise<Member[]> {
    return inRequestContext(this.em, () =>
      this.em.find(
        Member,
        { user: credentialId },
        { populate: ['organization'], orderBy: { createdAt: 'asc' } },
      ),
    );
  }
}
