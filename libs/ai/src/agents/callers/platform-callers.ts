import { Injectable } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import { IdentityResolver } from '@nestposts/auth/domain/auth/identity.resolver';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { AccessTokens } from '@nestposts/auth/infrastructure/better-auth/identity/access-tokens';
import { RequestHeaders } from '@nestposts/auth/infrastructure/request/request-headers';
import { inRequestContext, MikroORM } from '@nestposts/database';
import { TenantOrganizations } from '@nestposts/organizations/infrastructure/tenancy/tenant-organizations.service';

import type { AgentCallerHeaders } from './agent-caller';
import { PlatformCaller } from './platform-caller';

@Injectable()
export class PlatformCallers {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly orm: MikroORM,
    private readonly tenants: TenantOrganizations,
  ) {}

  async resolve(
    headers: AgentCallerHeaders,
  ): Promise<PlatformCaller | undefined> {
    const request = { headers };
    const accessToken = AccessTokens.bearerOf(
      RequestHeaders.from(request).get('authorization'),
    );
    if (!accessToken) return undefined;
    return inRequestContext(this.orm, async () => {
      const identity = await this.identityOf(request);
      return identity
        ? new PlatformCaller(
            identity,
            accessToken,
            await this.tenants.tenantOf(identity.activeOrganizationId),
          )
        : undefined;
    });
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
