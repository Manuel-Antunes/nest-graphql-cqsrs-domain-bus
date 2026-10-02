import { RequestMalformedError } from '@a2a-js/sdk/errors';
import {
  ServerCallContext,
  type ServerCallContextOptions,
} from '@a2a-js/sdk/server';

import type { AgentCaller } from '../../agents/callers/agent-caller';
import { PlatformCaller } from '../../agents/callers/platform-caller';
import { AgentMemories } from '../../checkpoint/agent-memories';

export class A2aTenancy {
  static tenantOf(caller: AgentCaller | undefined): string {
    return caller instanceof PlatformCaller ? caller.tenant : '';
  }

  static actorOf(
    tenant: string | undefined,
    caller: AgentCaller | undefined,
  ): string | undefined {
    if (!caller?.isAuthenticated) return undefined;
    return AgentMemories.actorOf(tenant, caller.userName);
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
    caller: AgentCaller | undefined,
  ): ServerCallContext {
    const tenant = A2aTenancy.tenantOf(caller);
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
