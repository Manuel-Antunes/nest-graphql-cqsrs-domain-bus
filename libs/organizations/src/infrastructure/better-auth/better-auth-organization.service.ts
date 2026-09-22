import { Inject, Injectable, Scope } from '@nestjs/common';
import { AuthService } from '@nestposts/auth/domain/auth/auth.service';
import type { BetterAuthWith } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { ActiveMemberNotFoundException } from '../../domain/organization/exception/active-member-not-found.exception';
import { OrganizationNotSelectedException } from '../../domain/organization/exception/organization-not-selected.exception';
import type { Member } from '../../domain/organization/member.entity';
import { MemberRepository } from '../../domain/organization/member.repository';
import type { Organization } from '../../domain/organization/organization.entity';
import { OrganizationRepository } from '../../domain/organization/organization.repository';
import {
  type OrganizationPermissionRequest,
  OrganizationService,
} from '../../domain/organization/organization.service';
import { OrganizationId } from '../../domain/organization/vo/organization-id';
import type { OrganizationAuthPlugins } from './organization-better-auth.plugin';

/**
 * The instance as THIS module knows it: the core plugins plus the organization one, which is the
 * plugin this module itself registers. That is what puts `setActiveOrganization` and
 * `hasPermission` on `api` — `@nestposts/auth`'s own `BetterAuth` type has neither, and should not.
 */
type OrganizationAwareAuth = BetterAuthWith<OrganizationAuthPlugins>;

@Injectable({ scope: Scope.REQUEST })
export class BetterAuthOrganizationService extends OrganizationService {
  constructor(
    @Inject(BETTER_AUTH) private readonly betterAuth: OrganizationAwareAuth,
    private readonly auth: AuthService,
    private readonly organizationRepository: OrganizationRepository,
    private readonly memberRepository: MemberRepository,
  ) {
    super();
  }

  async organizations(): Promise<Organization[]> {
    const session = await this.auth.requireSession();
    return this.organizationRepository.findAllOf(session.user.credentialId);
  }

  async activeOrganizationId(): Promise<OrganizationId | null> {
    const session = await this.auth.requireSession();
    return session.activeOrganizationId ? OrganizationId.parse(session.activeOrganizationId) : null;
  }

  async activeOrganization(): Promise<Organization | null> {
    const active = await this.activeOrganizationId();
    return active ? this.organizationRepository.findById(active) : null;
  }

  async setActiveOrganization(organizationId: OrganizationId | null): Promise<Organization | null> {
    await this.betterAuth.api.setActiveOrganization({
      body: { organizationId: organizationId ? organizationId.value : null },
      headers: this.auth.headers,
    });
    return organizationId ? this.organizationRepository.findById(organizationId) : null;
  }

  async activeMember(): Promise<Member | null> {
    const session = await this.auth.requireSession();
    if (!session.activeOrganizationId) {
      return null;
    }
    return this.memberRepository.findIn(
      OrganizationId.parse(session.activeOrganizationId),
      session.user.credentialId,
    );
  }

  /**
   * The caller's membership, or the refusal that says which of the two things is missing.
   *
   * No organization selected and no membership in the one that IS selected are different failures —
   * the first is a prompt, the second is a refusal — and the filter gives them different codes.
   */
  async requireActiveMember(): Promise<Member> {
    const session = await this.auth.requireSession();
    if (!session.activeOrganizationId) {
      throw new OrganizationNotSelectedException();
    }
    const organizationId = OrganizationId.parse(session.activeOrganizationId);
    const member = await this.memberRepository.findIn(organizationId, session.user.credentialId);
    if (!member) {
      throw new ActiveMemberNotFoundException(session.user.credentialId, organizationId);
    }
    return member;
  }

  async hasOrganizationRole(roles: readonly string[]): Promise<boolean> {
    const member = await this.activeMember().catch(() => null);
    return member ? roles.some((role) => member.hasRole(role)) : false;
  }

  async hasOrganizationPermission(
    permissions: OrganizationPermissionRequest,
    organizationId?: OrganizationId,
  ): Promise<boolean> {
    const granted = await this.betterAuth.api
      .hasPermission({
        headers: this.auth.headers,
        body: { permissions, organizationId: organizationId?.value } as never,
      })
      .catch(() => null);
    return granted?.success === true;
  }
}
