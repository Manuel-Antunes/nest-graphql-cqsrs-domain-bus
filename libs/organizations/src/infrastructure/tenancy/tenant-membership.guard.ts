import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable, Scope } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdentityResolver } from '@nestposts/auth/domain/auth/identity.resolver';
import { ExecutionRequest } from '@nestposts/auth/infrastructure/request/execution-request';
import { HeaderTenantResolver, Tenant } from '@nestposts/database';
import {
  MemberHasPermission,
  RequireActiveOrg,
} from '@thallesp/nestjs-better-auth';

import { OrganizationRepository } from '../../domain/organization/organization.repository';
import { OrganizationId } from '../../domain/organization/vo/organization-id';

/**
 * **A tenant is an organization, and only its members work in it.**
 *
 * The tenant a request names is where its rows are read from and written to, so naming one is a claim
 * to that organization's data, and this is where the claim is checked: a request to any tenant but
 * the root one needs a session whose user is a member of the organization with that slug — or an OAuth
 * client acting for itself, bound to that organization, which works in its tenant and no other. The
 * root tenant is everybody's — the feed a visitor who never signed in reads — and a message off the
 * broker carries a tenant its publisher already checked.
 *
 * **A handler that checks the ACTIVE organization works only in its tenant.** `@OrgRoles`,
 * `@MemberHasPermission` and `@RequireActiveOrg` (`@thallesp/nestjs-better-auth`) ask Better Auth about
 * the session's active organization, while the rows are the named tenant's — so on a handler carrying
 * any of them the tenant must be the active organization's, or an owner of one organization could
 * name another where they are only a member and act there with the first one's role. The root tenant
 * is no organization's, so there such a handler is refused as well. The keys are read off the
 * library's own decorators, never copied.
 *
 * The caller is `IdentityResolver`'s answer — what the authentication guard found when it ran first,
 * and a lookup otherwise. The guard is request-scoped, like the resolver, and remembers each verdict
 * for its request, because a guard on field resolvers runs once per field.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantMembershipGuard implements CanActivate {
  private static readonly ACTIVE_ORGANIZATION_CHECKS = [
    RequireActiveOrg().KEY,
    MemberHasPermission({ permissions: {} }).KEY,
  ];

  private membership?: Promise<boolean>;

  private activation?: Promise<boolean>;

  constructor(
    private readonly caller: IdentityResolver,
    private readonly organizations: OrganizationRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() === 'rpc') {
      return true;
    }
    const tenant = HeaderTenantResolver.read(context);
    const checksActiveOrganization = this.checksActiveOrganization(context);
    if (Tenant.isRoot(tenant) && !checksActiveOrganization) {
      return true;
    }
    if (!ExecutionRequest.of(context)) {
      return true;
    }
    if (!Tenant.isRoot(tenant) && !(await this.isMember(tenant))) {
      throw new ForbiddenException(
        `not a member of the organization behind tenant "${tenant}"`,
      );
    }
    if (checksActiveOrganization && !(await this.isActive(tenant))) {
      throw new ForbiddenException(
        `tenant "${tenant}" is not the one of the active organization, which this operation is checked against`,
      );
    }
    return true;
  }

  private checksActiveOrganization(context: ExecutionContext): boolean {
    return TenantMembershipGuard.ACTIVE_ORGANIZATION_CHECKS.some(
      (key) =>
        this.reflector.getAllAndOverride(key, [
          context.getHandler(),
          context.getClass(),
        ]) !== undefined,
    );
  }

  private isActive(tenant: string): Promise<boolean> {
    this.activation ??= this.lookUpActivation(tenant);
    return this.activation;
  }

  private isMember(tenant: string): Promise<boolean> {
    this.membership ??= this.lookUpMembership(tenant);
    return this.membership;
  }

  private async lookUpActivation(tenant: string): Promise<boolean> {
    const identity = await this.caller.identity();
    return this.addresses(identity?.activeOrganizationId ?? null, tenant);
  }

  private async lookUpMembership(tenant: string): Promise<boolean> {
    const identity = await this.caller.identity();
    if (!identity) {
      return false;
    }
    if (identity.kind === 'client') {
      return this.addresses(identity.activeOrganizationId, tenant);
    }
    const organizations = await this.organizations.findAllOf(identity.userId);
    return organizations.some((organization) =>
      organization.isAddressedBy(tenant),
    );
  }

  private async addresses(
    organizationId: string | null,
    tenant: string,
  ): Promise<boolean> {
    if (!organizationId || Tenant.isRoot(tenant)) {
      return false;
    }
    const organization = await this.organizations.findById(
      OrganizationId.parse(organizationId),
    );
    return organization?.isAddressedBy(tenant) ?? false;
  }
}
