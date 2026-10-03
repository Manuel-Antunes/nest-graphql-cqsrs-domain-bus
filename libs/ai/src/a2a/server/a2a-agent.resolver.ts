import type { AgentCard } from '@a2a-js/sdk';
import type { AgentExecutor, TaskStore } from '@a2a-js/sdk/server';
import { Injectable, type Type } from '@nestjs/common';

import { A2aRegistry } from './a2a.registry';
import type { A2aAgent } from './a2a-agent.decorator';

export interface ResolvedA2aAgent {
  readonly card: AgentCard;
  readonly executor: AgentExecutor;
  readonly taskStore: TaskStore;
}

export type A2aAgentReference = Type<A2aAgent> | string | null | undefined;

@Injectable()
export class A2aAgentResolver {
  constructor(private readonly registry: A2aRegistry) {}

  resolve(agent?: A2aAgentReference): ResolvedA2aAgent {
    const { card, hostedExecutor, taskStore } =
      typeof agent === 'function'
        ? this.registry.resolveProvider(agent)
        : this.registry.resolveAgent(agent);
    return { card, executor: hostedExecutor, taskStore };
  }
}
