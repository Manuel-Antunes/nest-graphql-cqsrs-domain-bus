import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';

import type {
  NewCredential,
  PasswordCredentials,
  PermissionRequest,
  SignedIn,
} from '../../../domain/auth/auth.service';
import type { Session } from '../../../domain/auth/session';
import type { BetterAuth } from '../init-auth';
import { AuthService } from '../../../domain/auth/auth.service';
import { SessionNotAuthenticatedException } from '../../../domain/auth/exception/session-not-authenticated.exception';
import { RequestHeaders } from '../request-headers';
import { BETTER_AUTH } from '../tokens';

interface OrganizationAwareSessionRow {
  activeOrganizationId?: string | null;
}

@Injectable({ scope: Scope.REQUEST })
export class BetterAuthService extends AuthService {
  readonly headers: Headers;

  constructor(
    @Inject(BETTER_AUTH) private readonly betterAuth: BetterAuth,
    @Inject(REQUEST) request: unknown,
  ) {
    super();
    this.headers = RequestHeaders.from(request);
  }

  /** `auth_user.role` is one column, and a caller may hold more than one role in it. */
  private static rolesOf(role: string | null | undefined): string[] {
    return (role ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  get instance(): BetterAuth {
    return this.betterAuth;
  }

  get api(): BetterAuth['api'] {
    return this.betterAuth.api;
  }

  async session(): Promise<Session | null> {
    const found = await this.betterAuth.api.getSession({
      headers: this.headers,
    });
    if (!found) {
      return null;
    }
    const row = found.session as typeof found.session &
      OrganizationAwareSessionRow;
    return {
      user: {
        credentialId: CredentialId.parse(found.user.id),
        email: Email.parse(found.user.email),
        name: UserName.parse(found.user.name),
        roles: BetterAuthService.rolesOf(found.user.role),
      },
      token: found.session.token,
      expiresAt: found.session.expiresAt,
      activeOrganizationId: row.activeOrganizationId ?? null,
    };
  }

  async requireSession(): Promise<Session> {
    const session = await this.session();
    if (!session) {
      throw new SessionNotAuthenticatedException();
    }
    return session;
  }

  async signInWithPassword({
    email,
    password,
  }: PasswordCredentials): Promise<SignedIn> {
    const signed = await this.betterAuth.api.signInEmail({
      body: { email, password },
      headers: this.headers,
    });
    return {
      token: signed.token ?? '',
      credentialId: CredentialId.parse(signed.user.id),
    };
  }

  async signUpWithPassword({
    email,
    password,
    name,
  }: NewCredential): Promise<SignedIn> {
    const signed = await this.betterAuth.api.signUpEmail({
      body: { email, password, name },
      headers: this.headers,
    });
    return {
      token: signed.token ?? '',
      credentialId: CredentialId.parse(signed.user.id),
    };
  }

  async signOut(): Promise<void> {
    await this.betterAuth.api.signOut({ headers: this.headers });
  }

  async hasRole(roles: readonly string[]): Promise<boolean> {
    const session = await this.session();
    return session
      ? roles.some((role) => session.user.roles.includes(role))
      : false;
  }

  async hasPermission(permissions: PermissionRequest): Promise<boolean> {
    const granted = await this.betterAuth.api
      .userHasPermission({
        headers: this.headers,
        body: { permissions } as never,
      })
      .catch(() => null);
    return granted?.success === true;
  }

  openApiSchema(): Promise<unknown> {
    return this.betterAuth.api.generateOpenAPISchema({});
  }
}
