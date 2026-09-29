import 'server-only';

import { cookies } from 'next/headers';
import type { AuthSocialProvider } from '@better-auth-ui/core';
import type { AuthServer } from '@better-auth-ui/core/server';
import { authConfig } from '@nestposts/auth/config/auth.config';
import type { PermissionRequest } from '@nestposts/auth/domain/auth/auth.service';
import { AuthService } from '@nestposts/auth/domain/auth/auth.service';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { billingConfig } from '@nestposts/billing/config/billing.config';
import { BillingService } from '@nestposts/billing/infrastructure/better-auth/billing.service';
import type { OrganizationPermissionRequest } from '@nestposts/organizations/domain/organization/organization.service';
import { OrganizationService } from '@nestposts/organizations/domain/organization/organization.service';
import type { OrganizationRole } from '@nestposts/organizations/domain/organization/schemas/member-role.schema';
import { OrganizationId } from '@nestposts/organizations/domain/organization/vo/organization-id';

import { Endpoints } from '@/lib/endpoints';
import { Nest } from '@/nest/container';

import type { SystemRole } from './roles';

interface BetterAuthHandler {
  handler(request: Request): Promise<Response>;
}

/**
 * Better Auth, running HERE — and wired by the same Nest modules `apps/posts-api` uses.
 *
 * The Next server is not a client of the posts-api's auth: it is a second holder of the same one,
 * against the same Postgres and under the same `AUTH_SECRET`. What that buys is a session cookie set
 * on THIS origin, and `AuthService` resolved per request with the incoming headers already in it —
 * the very same request-scoped service a resolver injects on the other side.
 */
export class WebAuth {
  /** The request-scoped port, built from this request's headers. */
  static auth(): Promise<AuthService> {
    return Nest.resolve(AuthService);
  }

  static organizations(): Promise<OrganizationService> {
    return Nest.resolve(OrganizationService);
  }

  static billing(): Promise<BillingService> {
    return Nest.resolve(BillingService);
  }

  /**
   * The instance as better-auth-ui's server helpers take it — `ensureSessionServer` and the other
   * prefetches — with every endpoint run inside a database context, which nothing else opens here.
   */
  static async server(): Promise<AuthServer> {
    const auth = await Nest.get<AuthServer>(BETTER_AUTH);
    return { api: await Nest.scoped(auth.api) };
  }

  /** The social providers this deployment has credentials for — the sign-in screen offers these. */
  static socialProviders(): AuthSocialProvider[] {
    const { google, github } = authConfig();
    return [
      ...(google ? (['google'] as const) : []),
      ...(github ? (['github'] as const) : []),
    ];
  }

  static async hasRole(roles: readonly SystemRole[]): Promise<boolean> {
    return (await WebAuth.auth()).hasRole(roles);
  }

  static async hasPermission(permissions: PermissionRequest): Promise<boolean> {
    return (await WebAuth.auth()).hasPermission(permissions);
  }

  static async hasOrgRole(
    roles: readonly OrganizationRole[],
  ): Promise<boolean> {
    return (await WebAuth.organizations()).hasOrganizationRole(roles);
  }

  static async hasOrgPermission(
    permissions: OrganizationPermissionRequest,
    organizationId?: string,
  ): Promise<boolean> {
    return (await WebAuth.organizations()).hasOrganizationPermission(
      permissions,
      organizationId ? OrganizationId.parse(organizationId) : undefined,
    );
  }

  static billingEnabled(): boolean {
    return billingConfig().polar !== null;
  }

  /** The instance itself, for the `/api/auth/*` catch-all Next serves. */
  static async handle(request: Request): Promise<Response> {
    const auth = await Nest.get<BetterAuthHandler>(BETTER_AUTH);
    return auth.handler(request);
  }

  /**
   * Who is making this request, as every process reads a caller — `null` covers both "no cookie"
   * and "a cookie whose row is gone": from the browser's side those are the same fact.
   */
  static async identity(): Promise<Identity | null> {
    return (await WebAuth.auth()).identity().catch(() => null);
  }

  /**
   * The session cookie this request arrived with, ready to be put on a request to the posts-api.
   *
   * It is the browser's own cookie now — set by `nextCookies()` on this origin — rather than one this
   * server fetched from another origin and kept in a jar of its own. The posts-api resolves it
   * against the same `session` row, which is what makes forwarding enough.
   */
  static async sessionCookie(): Promise<string | null> {
    const jar = await cookies();
    const carried = jar
      .getAll()
      .filter(
        (cookie) =>
          cookie.name.includes('better-auth') ||
          cookie.name.startsWith('__Secure-'),
      )
      .map((cookie) => `${cookie.name}=${cookie.value}`);
    return carried.length > 0 ? carried.join('; ') : null;
  }

  /**
   * The tenant this request works in: the one it named, or else the organization active in its
   * session, whose schema is where that organization's posts are. The subgraph checks the claim.
   */
  static async tenantHeader(): Promise<Record<string, string>> {
    const auth = await WebAuth.auth();
    const named = auth.headers.get(Endpoints.tenantHeader);
    if (named) {
      return { [Endpoints.tenantHeader]: named };
    }
    const active = await (await WebAuth.organizations())
      .activeOrganization()
      .catch(() => null);
    return active ? { [Endpoints.tenantHeader]: active.slug.value } : {};
  }
}
