import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { HeaderTenantResolver, Tenant } from '@nestposts/database';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import {
  MemberHasPermission,
  RequireActiveOrg,
} from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';

import { OrganizationRepository } from '../../domain/organization/organization.repository';
import { OrganizationId } from '../../domain/organization/vo/organization-id';

type Headers = Record<string, string | string[] | undefined>;

interface RequestSession {
  user?: { id?: string };
  session?: { activeOrganizationId?: string | null };
}

interface AuthenticatedRequest {
  headers?: Headers;
  session?: RequestSession | null;
}

/**
 * **A tenant is an organization, and only its members work in it.**
 *
 * The tenant a request names is where its rows are read from and written to, so naming one is a claim
 * to that organization's data, and this is where the claim is checked: a request to any tenant but
 * the root one needs a session whose user is a member of the organization with that slug. The root
 * tenant is everybody's — the feed a visitor who never signed in reads — and a message off the broker
 * carries a tenant its publisher already checked.
 *
 * **A handler that checks the ACTIVE organization works only in its tenant.** `@OrgRoles`,
 * `@MemberHasPermission` and `@RequireActiveOrg` (`@thallesp/nestjs-better-auth`) ask Better Auth about
 * the session's active organization, while the rows are the named tenant's — so on a handler carrying
 * any of them the tenant must be the active organization's, or an owner of one organization could
 * name another where they are only a member and act there with the first one's role. The root tenant
 * is no organization's, so there such a handler is refused as well. The keys are read off the
 * library's own decorators, never copied.
 *
 * The session is the one the authentication guard put on the request when it ran first, and asked for
 * otherwise; each verdict is remembered per request, because a guard on field resolvers runs once per
 * field.
 */
@Injectable()
export class TenantMembershipGuard implements CanActivate {
  private static readonly ACTIVE_ORGANIZATION_CHECKS = [
    RequireActiveOrg().KEY,
    MemberHasPermission({ permissions: {} }).KEY,
  ];

  private readonly memberships = new WeakMap<object, Promise<boolean>>();

  private readonly activations = new WeakMap<object, Promise<boolean>>();

  private readonly sessions = new WeakMap<
    object,
    Promise<RequestSession | null>
  >();

  constructor(
    @Inject(BETTER_AUTH) private readonly auth: BetterAuth,
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
    const request = TenantMembershipGuard.requestOf(context);
    if (!request) {
      return true;
    }
    if (
      !Tenant.isRoot(tenant) &&
      !(await TenantMembershipGuard.remembered(this.memberships, request, () =>
        this.isMember(request, tenant),
      ))
    ) {
      throw new ForbiddenException(
        `not a member of the organization behind tenant "${tenant}"`,
      );
    }
    if (
      checksActiveOrganization &&
      !(await TenantMembershipGuard.remembered(this.activations, request, () =>
        this.isActive(request, tenant),
      ))
    ) {
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

  private async isActive(
    request: AuthenticatedRequest,
    tenant: string,
  ): Promise<boolean> {
    const active = (await this.sessionOf(request))?.session
      ?.activeOrganizationId;
    if (!active || Tenant.isRoot(tenant)) {
      return false;
    }
    const organization = await this.organizations.findById(
      OrganizationId.parse(active),
    );
    return organization?.isAddressedBy(tenant) ?? false;
  }

  private async isMember(
    request: AuthenticatedRequest,
    tenant: string,
  ): Promise<boolean> {
    const session = await this.sessionOf(request);
    const userId = session?.user?.id;
    if (!userId) {
      return false;
    }
    const organizations = await this.organizations.findAllOf(
      CredentialId.parse(userId),
    );
    return organizations.some((organization) =>
      organization.isAddressedBy(tenant),
    );
  }

  private async sessionOf(
    request: AuthenticatedRequest,
  ): Promise<RequestSession | null> {
    if (request.session !== undefined) {
      return request.session;
    }
    return TenantMembershipGuard.remembered(this.sessions, request, () =>
      this.auth.api.getSession({
        headers: fromNodeHeaders(request.headers ?? {}),
      }),
    );
  }

  private static remembered<T>(
    answers: WeakMap<object, Promise<T>>,
    request: AuthenticatedRequest,
    answer: () => Promise<T>,
  ): Promise<T> {
    let answered = answers.get(request);
    if (!answered) {
      answered = answer();
      answers.set(request, answered);
    }
    return answered;
  }

  private static requestOf(
    context: ExecutionContext,
  ): AuthenticatedRequest | undefined {
    if (context.getType<string>() === 'graphql') {
      return context.getArgByIndex<{ req?: AuthenticatedRequest } | undefined>(
        2,
      )?.req;
    }
    return context.switchToHttp().getRequest<AuthenticatedRequest>();
  }
}
