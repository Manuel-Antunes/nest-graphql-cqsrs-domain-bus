import type { AgentContext } from '@nestposts/ai/agents/context/agent-context';
import { AgentMemories } from '@nestposts/ai/checkpoint/agent-memories';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';

export class PlatformAgentContext implements AgentContext {
  constructor(
    readonly identity: Identity,
    readonly credential: string,
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
