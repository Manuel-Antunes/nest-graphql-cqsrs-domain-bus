import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';

import { AgentMemories } from '../../checkpoint/agent-memories';
import type { AgentCaller } from './agent-caller';

export class PlatformCaller implements AgentCaller {
  constructor(
    readonly identity: Identity,
    readonly accessToken: string,
    readonly tenant: string,
  ) {}

  get isAuthenticated(): boolean {
    return true;
  }

  get userName(): string {
    return this.identity.principal;
  }

  get actorId(): string {
    return AgentMemories.actorOf(this.tenant, this.identity.principal);
  }
}
