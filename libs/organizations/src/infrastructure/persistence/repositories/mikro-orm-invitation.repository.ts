import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '@nestposts/database';
import type { Email } from '@nestposts/users/domain/user/vo/email';

import { Invitation } from '../../../domain/organization/invitation.entity';
import { InvitationRepository } from '../../../domain/organization/invitation.repository';
import { PENDING_INVITATION } from '../../../domain/organization/schemas/invitation-status.schema';
import type { InvitationId } from '../../../domain/organization/vo/invitation-id';
import { InvitationStatus } from '../../../domain/organization/vo/invitation-status';
import type { OrganizationId } from '../../../domain/organization/vo/organization-id';

@Injectable()
export class MikroOrmInvitationRepository extends InvitationRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  findById(invitationId: InvitationId): Promise<Invitation | null> {
    return inRequestContext(this.em, () =>
      this.em.findOne(
        Invitation,
        { id: invitationId },
        { populate: ['organization'] },
      ),
    );
  }

  findOpenFor(email: Email, now: Date): Promise<Invitation[]> {
    return inRequestContext(this.em, () =>
      this.em.find(
        Invitation,
        {
          email,
          status: InvitationStatus.parse(PENDING_INVITATION),
          expiresAt: { $gt: now },
        },
        { populate: ['organization'], orderBy: { createdAt: 'desc' } },
      ),
    );
  }

  findAllIn(organizationId: OrganizationId): Promise<Invitation[]> {
    return inRequestContext(this.em, () =>
      this.em.find(
        Invitation,
        { organization: organizationId },
        { orderBy: { createdAt: 'desc' } },
      ),
    );
  }
}
