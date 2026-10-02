import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';

import type { AgentCaller } from './agent-caller';

export class PlatformCaller implements AgentCaller {
  constructor(
    readonly identity: Identity,
    readonly accessToken: string,
  ) {}

  get isAuthenticated(): boolean {
    return true;
  }

  get userName(): string {
    return this.identity.principal;
  }
}
