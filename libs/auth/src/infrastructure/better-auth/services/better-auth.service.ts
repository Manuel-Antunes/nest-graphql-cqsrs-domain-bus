import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type {
  NewCredential,
  PasswordCredentials,
  PermissionRequest,
  SignedIn,
} from '../../../domain/auth/auth.service';
import { AuthService } from '../../../domain/auth/auth.service';
import { SessionNotAuthenticatedException } from '../../../domain/auth/exception/session-not-authenticated.exception';
import { IdentityResolver } from '../../../domain/auth/identity.resolver';
import type { Identity } from '../../../domain/auth/vo/identity';
import { RequestHeaders } from '../../request/request-headers';
import type { BetterAuth } from '../init-auth';
import { BETTER_AUTH } from '../tokens';

@Injectable({ scope: Scope.REQUEST })
export class BetterAuthService extends AuthService {
  readonly headers: Headers;

  constructor(
    @Inject(BETTER_AUTH) private readonly betterAuth: BetterAuth,
    @Inject(REQUEST) request: unknown,
    private readonly caller: IdentityResolver,
  ) {
    super();
    this.headers = RequestHeaders.from(request);
  }

  get instance(): BetterAuth {
    return this.betterAuth;
  }

  get api(): BetterAuth['api'] {
    return this.betterAuth.api;
  }

  identity(): Promise<Identity | null> {
    return this.caller.identity();
  }

  async requireIdentity(): Promise<Identity> {
    const identity = await this.identity();
    if (!identity) {
      throw new SessionNotAuthenticatedException();
    }
    return identity;
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
      userId: UserId.parse(signed.user.id),
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
      userId: UserId.parse(signed.user.id),
    };
  }

  async signOut(): Promise<void> {
    await this.betterAuth.api.signOut({ headers: this.headers });
  }

  async hasRole(roles: readonly string[]): Promise<boolean> {
    return (await this.identity())?.hasAnyRole(roles) ?? false;
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
