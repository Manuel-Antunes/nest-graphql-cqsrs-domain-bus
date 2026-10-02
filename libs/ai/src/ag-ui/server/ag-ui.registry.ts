import type { AbstractAgent } from '@ag-ui/client';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type Type,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import {
  type AgUiAgent,
  type AgUiAgentConfig,
  AgUiAgentDeclaration,
} from './ag-ui-agent.decorator';
import { AgUiModuleOptions } from './ag-ui-module.options';
import { LazyAgUiAgent } from './lazy-ag-ui.agent';

export interface RegisteredAgUiAgent {
  readonly config: AgUiAgentConfig;
  readonly agent: AbstractAgent;
  readonly providerClass: Type<AgUiAgent>;
}

export type AgUiAgentReference = Type<AgUiAgent> | string | null | undefined;

@Injectable()
export class AgUiRegistry implements OnModuleInit {
  private readonly logger = new Logger(AgUiRegistry.name);
  private readonly agents: RegisteredAgUiAgent[] = [];

  constructor(
    @Inject(AgUiModuleOptions) private readonly options: AgUiModuleOptions,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const ProviderClass of this.options.agentProviders ?? []) {
      const config = AgUiAgentDeclaration.of(ProviderClass);
      if (!config) {
        throw new Error(
          `AgUiRegistry: ${ProviderClass.name} is registered as an AG-UI agent provider but carries no @AgUiAgent metadata.`,
        );
      }
      const instance = await this.instanceOf(ProviderClass);
      if (typeof instance?.agent !== 'function' && !instance?.agent?.run) {
        throw new Error(
          `AgUiRegistry: ${ProviderClass.name}.agent is neither an AG-UI agent nor a function that builds one.`,
        );
      }
      this.agents.push({
        config,
        agent: AgUiRegistry.hosted(config, LazyAgUiAgent.of(instance.agent)),
        providerClass: ProviderClass,
      });
    }
    if (this.agents.length === 0) {
      throw new Error(
        'AgUiRegistry: No agents discovered. Register at least one @AgUiAgent provider.',
      );
    }
    this.logger.log(
      `AG-UI Registry initialized with ${this.agents.length} agent(s): ${this.agents
        .map((agent) => agent.config.id)
        .join(', ')}`,
    );
  }

  resolve(reference?: AgUiAgentReference): RegisteredAgUiAgent {
    if (!reference) return this.agents[0];
    const agent = this.agents.find((registered) =>
      typeof reference === 'function'
        ? registered.providerClass === reference
        : registered.config.id === reference,
    );
    if (!agent) {
      throw new Error(
        `AgUiRegistry: no AG-UI agent is registered as ${typeof reference === 'function' ? reference.name : reference}. Known: ${this.agents
          .map((registered) => registered.config.id)
          .join(', ')}.`,
      );
    }
    return agent;
  }

  getAgents(): RegisteredAgUiAgent[] {
    return [...this.agents];
  }

  private static hosted(
    config: AgUiAgentConfig,
    agent: AbstractAgent,
  ): AbstractAgent {
    agent.agentId ??= config.id;
    if (config.description) agent.description = config.description;
    return agent;
  }

  private async instanceOf(
    ProviderClass: Type<AgUiAgent>,
  ): Promise<AgUiAgent | undefined> {
    try {
      return this.moduleRef.get(ProviderClass, { strict: false });
    } catch {
      return this.moduleRef.resolve(ProviderClass, undefined, {
        strict: false,
      });
    }
  }
}
