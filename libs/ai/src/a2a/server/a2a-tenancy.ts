import { RequestMalformedError } from '@a2a-js/sdk/errors';
import type { User } from '@a2a-js/sdk/server';
import {
  ServerCallContext,
  type ServerCallContextOptions,
} from '@a2a-js/sdk/server';

import { AgentContexts } from '../../agents/context/agent-context';
import { AgentMemories } from '../../checkpoint/agent-memories';

export class A2aTenancy {
  static tenantOf(user: User | undefined): string {
    return AgentContexts.isAgentContext(user) ? user.tenant : '';
  }

  static actorOf(
    tenant: string | undefined,
    user: User | undefined,
  ): string | undefined {
    if (!user?.isAuthenticated) return undefined;
    return AgentMemories.actorOf(tenant, user.userName);
  }
}

export class TenantScopedCallContext extends ServerCallContext {
  constructor(
    options: ServerCallContextOptions,
    private readonly callerTenant: string,
  ) {
    super(options);
  }

  static of(
    context: ServerCallContext,
    user: User | undefined,
  ): ServerCallContext {
    const tenant = A2aTenancy.tenantOf(user);
    if (!tenant) return context;
    return new TenantScopedCallContext(
      {
        requestedExtensions: context.requestedExtensions,
        user: context.user,
        requestedVersion: context.requestedVersion,
        state: context.state,
      },
      tenant,
    );
  }

  override get tenant(): string | undefined {
    return super.tenant ?? this.callerTenant;
  }

  override setTenant(tenant: string): void {
    if (tenant && tenant !== this.callerTenant) {
      throw new RequestMalformedError(
        `The request names the tenant "${tenant}", and the caller's access token acts in "${this.callerTenant}".`,
      );
    }
    super.setTenant(tenant);
  }
}
