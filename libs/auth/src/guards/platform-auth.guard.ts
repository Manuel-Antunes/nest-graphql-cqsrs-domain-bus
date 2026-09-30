import type { ExecutionContext } from '@nestjs/common';
import {
  ForbiddenException,
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AllowAnonymous,
  AuthGuard,
  MemberHasPermission,
  OptionalAuth,
  OrgRoles,
  RequireActiveOrg,
  Roles,
  UserHasPermission,
} from '@thallesp/nestjs-better-auth';

import { IdentityResolver } from '../domain/auth/identity.resolver';
import { AccessTokens } from '../infrastructure/better-auth/identity/access-tokens';
import { BetterAuthIdentityResolver } from '../infrastructure/better-auth/identity/better-auth-identity.resolver';
import type { BetterAuth } from '../infrastructure/better-auth/init-auth';
import { BETTER_AUTH } from '../infrastructure/better-auth/tokens';
import { ExecutionRequest } from '../infrastructure/request/execution-request';
import { RequestHeaders } from '../infrastructure/request/request-headers';
import { ScopesGuard } from './scopes.guard';

/**
 * **The global guard: `@thallesp/nestjs-better-auth`'s, and OAuth clients besides.** Every caller with
 * a session — a cookie, or a user's access token (`oauth-bearer-session`) — goes through the library's
 * own `AuthGuard` untouched: `@AllowAnonymous`, `@OptionalAuth`, `@Roles`, `@OrgRoles`,
 * `@UserHasPermission`, `@MemberHasPermission` and `@RequireActiveOrg` mean what they always meant.
 *
 * A token of the client credentials grant is no session, and that guard would refuse it. Here it is
 * read as a `ClientIdentity` and admitted only where a machine can be:
 *
 * - on a handler that declares the scopes it requires (`@RequireScopes`) — whether the client was
 *   granted them is `ScopesGuard`'s, as for everyone — never on one that declares none;
 * - never on a handler that asks for a user or a member (`@Roles`, `@OrgRoles`, `@UserHasPermission`,
 *   `@MemberHasPermission`): a client is neither;
 * - with `@RequireActiveOrg`, only when it is bound to an organization.
 *
 * What it found is recorded on the request, so `@CurrentIdentity()` and the tenant guard read the
 * client without asking again. Request-scoped, like the `IdentityResolver` it asks.
 */
@Injectable({ scope: Scope.REQUEST })
export class PlatformAuthGuard extends AuthGuard {
  private static readonly PUBLIC = AllowAnonymous().KEY;
  private static readonly OPTIONAL = OptionalAuth().KEY;
  private static readonly REQUIRES_ACTIVE_ORGANIZATION = RequireActiveOrg().KEY;
  private static readonly FOR_USERS_AND_MEMBERS = PlatformAuthGuard.keysOf([
    Roles([]),
    OrgRoles([]),
    UserHasPermission({ permissions: {} }),
    MemberHasPermission({ permissions: {} }),
  ]).filter((key) => key !== PlatformAuthGuard.REQUIRES_ACTIVE_ORGANIZATION);

  constructor(
    private readonly metadata: Reflector,
    @Inject(BETTER_AUTH) auth: BetterAuth,
    private readonly caller: IdentityResolver,
  ) {
    super(metadata, { auth } as ConstructorParameters<typeof AuthGuard>[1]);
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = ExecutionRequest.of(context);
    const bearer =
      request &&
      AccessTokens.bearerOf(RequestHeaders.from(request).get('authorization'));
    if (!bearer || !AccessTokens.isIssuedToAClient(bearer)) {
      return super.canActivate(context);
    }
    const client = await this.caller.identity();
    BetterAuthIdentityResolver.guard(request, client);
    if (this.declares(context, PlatformAuthGuard.PUBLIC)) {
      return true;
    }
    if (!client) {
      if (this.declares(context, PlatformAuthGuard.OPTIONAL)) {
        return true;
      }
      throw new UnauthorizedException('The access token was refused');
    }
    if (
      PlatformAuthGuard.FOR_USERS_AND_MEMBERS.some((key) =>
        this.declares(context, key),
      )
    ) {
      throw new ForbiddenException(
        'This operation is for users and members, and an OAuth client is neither',
      );
    }
    if (
      this.declares(context, PlatformAuthGuard.REQUIRES_ACTIVE_ORGANIZATION) &&
      !client.activeOrganizationId
    ) {
      throw new ForbiddenException('Active organization is required');
    }
    if (!this.declaresScopes(context)) {
      throw new ForbiddenException(
        'This operation admits no OAuth client: it requires no scope a client could be granted',
      );
    }
    return true;
  }

  private static keysOf(decorators: readonly ClassDecorator[]): string[] {
    return decorators.flatMap((decorator) => {
      class Probe {}
      decorator(Probe);
      return Reflect.getOwnMetadataKeys(Probe) as string[];
    });
  }

  private declares(context: ExecutionContext, key: string): boolean {
    const declared = this.metadata.getAllAndOverride<unknown>(key, [
      context.getHandler(),
      context.getClass(),
    ]);
    return Array.isArray(declared) ? declared.length > 0 : Boolean(declared);
  }

  private declaresScopes(context: ExecutionContext): boolean {
    return (
      this.metadata.getAllAndMerge(ScopesGuard.required, [
        context.getHandler(),
        context.getClass(),
      ]).length > 0
    );
  }
}
