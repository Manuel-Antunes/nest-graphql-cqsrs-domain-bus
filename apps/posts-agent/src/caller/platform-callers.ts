import { Injectable } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { IdentityResolver } from '@nestposts/auth/domain/auth/identity.resolver';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { AccessTokens } from '@nestposts/auth/infrastructure/better-auth/identity/access-tokens';
import { RequestHeaders } from '@nestposts/auth/infrastructure/request/request-headers';
import { inRequestContext, MikroORM } from '@nestposts/database';

import { PlatformCaller } from './platform-caller';

export type CallerHeaders = Record<string, string | string[] | undefined>;

@Injectable()
export class PlatformCallers {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly orm: MikroORM,
  ) {}

  async resolve(headers: CallerHeaders): Promise<PlatformCaller | undefined> {
    const request = { headers };
    const accessToken = AccessTokens.bearerOf(
      RequestHeaders.from(request).get('authorization'),
    );
    if (!accessToken) return undefined;
    const identity = await inRequestContext(this.orm, () =>
      this.identityOf(request),
    );
    return identity ? new PlatformCaller(identity, accessToken) : undefined;
  }

  private async identityOf(request: object): Promise<Identity | null> {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(request, contextId);
    const resolver = await this.moduleRef.resolve(IdentityResolver, contextId, {
      strict: false,
    });
    return resolver.identity();
  }
}
