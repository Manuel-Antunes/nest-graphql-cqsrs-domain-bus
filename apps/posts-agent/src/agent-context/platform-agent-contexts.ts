import { Injectable } from '@nestjs/common';
import { ContextIdFactory, ModuleRef } from '@nestjs/core';
import type { AgentRequest } from '@nestposts/ai/agents/context/agent-context';
import { IdentityResolver } from '@nestposts/auth/domain/auth/identity.resolver';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { AccessTokens } from '@nestposts/auth/infrastructure/better-auth/identity/access-tokens';
import { RequestHeaders } from '@nestposts/auth/infrastructure/request/request-headers';
import { inRequestContext, MikroORM } from '@nestposts/database';
import { TenantOrganizations } from '@nestposts/organizations/infrastructure/tenancy/tenant-organizations.service';

import { PlatformAgentContext } from './platform-agent-context';

@Injectable()
export class PlatformAgentContexts {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly orm: MikroORM,
    private readonly tenants: TenantOrganizations,
  ) {}

  async of(request: AgentRequest): Promise<PlatformAgentContext | undefined> {
    const credential = AccessTokens.bearerOf(
      RequestHeaders.from(request).get('authorization'),
    );
    if (!credential) return undefined;
    return inRequestContext(this.orm, async () => {
      const identity = await this.identityOf(request);
      return identity
        ? new PlatformAgentContext(
            identity,
            credential,
            await this.tenants.tenantOf(identity.activeOrganizationId),
          )
        : undefined;
    });
  }

  private async identityOf(request: AgentRequest): Promise<Identity | null> {
    const contextId = ContextIdFactory.create();
    this.moduleRef.registerRequestByContextId(request, contextId);
    const resolver = await this.moduleRef.resolve(IdentityResolver, contextId, {
      strict: false,
    });
    return resolver.identity();
  }
}
