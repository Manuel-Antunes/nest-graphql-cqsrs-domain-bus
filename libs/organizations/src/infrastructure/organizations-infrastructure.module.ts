import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';

import { InvitationRepository } from '../domain/organization/invitation.repository';
import { MemberRepository } from '../domain/organization/member.repository';
import { OrganizationRepository } from '../domain/organization/organization.repository';
import { OrganizationService } from '../domain/organization/organization.service';
import { BetterAuthOrganizationService } from './better-auth/better-auth-organization.service';
import { organizationEntities } from './persistence/organization-entities';
import { MikroOrmInvitationRepository } from './persistence/repositories/mikro-orm-invitation.repository';
import { MikroOrmMemberRepository } from './persistence/repositories/mikro-orm-member.repository';
import { MikroOrmOrganizationRepository } from './persistence/repositories/mikro-orm-organization.repository';

/**
 * **The organization module's adapters, bound to its ports.**
 *
 * It does not install Better Auth — `AuthInfrastructureModule.forRoot({ plugins: [...] })` does, at
 * the composition root, taking this module's plugin provider. What lives here is everything that is
 * true whether or not a request is being authenticated: the three tables, their repositories, and
 * `OrganizationService` over the instance auth built.
 */
@Module({
  imports: [DatabaseModule.forFeature(organizationEntities)],
  providers: [
    {
      provide: OrganizationRepository,
      useClass: MikroOrmOrganizationRepository,
    },
    { provide: MemberRepository, useClass: MikroOrmMemberRepository },
    { provide: InvitationRepository, useClass: MikroOrmInvitationRepository },
    { provide: OrganizationService, useClass: BetterAuthOrganizationService },
  ],
  exports: [
    OrganizationRepository,
    MemberRepository,
    InvitationRepository,
    OrganizationService,
  ],
})
export class OrganizationsInfrastructureModule {}
