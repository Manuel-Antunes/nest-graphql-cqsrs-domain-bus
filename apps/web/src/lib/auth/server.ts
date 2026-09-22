import 'server-only';

import { AuthService } from '@nestposts/auth/domain/auth/auth.service';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { OrganizationService } from '@nestposts/organizations/domain/organization/organization.service';
import { cookies } from 'next/headers';

import { Nest } from '@/nest/container';
import { TENANT_HEADER } from '@/lib/env';

import type { Session } from './session';

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

  /** The instance itself, for the `/api/auth/*` catch-all Next serves. */
  static async handle(request: Request): Promise<Response> {
    const auth = await Nest.get<BetterAuthHandler>(BETTER_AUTH);
    return auth.handler(request);
  }

  /**
   * The session as Better Auth answers it, in the shape this application reads.
   *
   * `null` covers both "no cookie" and "a cookie whose row is gone" — from the browser's side those
   * are the same fact, and there is no refresh token to tell them apart with.
   */
  static async session(): Promise<Session | null> {
    const found = await (await WebAuth.auth()).session().catch(() => null);
    if (!found) {
      return null;
    }
    return {
      expiresAt: found.expiresAt.getTime(),
      activeOrganizationId: found.activeOrganizationId,
      user: {
        id: found.user.credentialId.value,
        email: found.user.email.value,
        name: found.user.name.value,
        role: found.user.roles.join(',') || null,
      },
    };
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
      .filter((cookie) => cookie.name.includes('better-auth') || cookie.name.startsWith('__Secure-'))
      .map((cookie) => `${cookie.name}=${cookie.value}`);
    return carried.length > 0 ? carried.join('; ') : null;
  }

  /** The tenant this request named, forwarded unchanged to whatever this server calls next. */
  static async tenantHeader(): Promise<Record<string, string>> {
    const auth = await WebAuth.auth();
    const tenant = auth.headers.get(TENANT_HEADER);
    return tenant ? { [TENANT_HEADER]: tenant } : {};
  }
}
