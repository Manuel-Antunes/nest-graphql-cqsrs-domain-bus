import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { HeaderTenantResolver, Tenant } from '@nestposts/database';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { fromNodeHeaders } from 'better-auth/node';

import { OrganizationRepository } from '../../domain/organization/organization.repository';

type Headers = Record<string, string | string[] | undefined>;

interface AuthenticatedRequest {
  headers?: Headers;
  session?: { user?: { id?: string } } | null;
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
 * The session is the one the authentication guard put on the request when it ran first, and asked for
 * otherwise; the verdict is remembered per request, because a guard on field resolvers runs once per
 * field.
 */
@Injectable()
export class TenantMembershipGuard implements CanActivate {
  private readonly verdicts = new WeakMap<object, Promise<boolean>>();

  constructor(
    @Inject(BETTER_AUTH) private readonly auth: BetterAuth,
    private readonly organizations: OrganizationRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() === 'rpc') {
      return true;
    }
    const tenant = HeaderTenantResolver.read(context);
    if (Tenant.isRoot(tenant)) {
      return true;
    }
    const request = TenantMembershipGuard.requestOf(context);
    if (!request) {
      return true;
    }
    let verdict = this.verdicts.get(request);
    if (!verdict) {
      verdict = this.isMember(request, tenant);
      this.verdicts.set(request, verdict);
    }
    if (!(await verdict)) {
      throw new ForbiddenException(
        `not a member of the organization behind tenant "${tenant}"`,
      );
    }
    return true;
  }

  private async isMember(
    request: AuthenticatedRequest,
    tenant: string,
  ): Promise<boolean> {
    const session =
      request.session !== undefined
        ? request.session
        : await this.auth.api.getSession({
            headers: fromNodeHeaders(request.headers ?? {}),
          });
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
