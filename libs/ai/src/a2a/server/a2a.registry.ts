import {
  A2A_PROTOCOL_VERSION,
  type AgentCapabilities,
  type AgentCard,
  type AgentSkill,
} from '@a2a-js/sdk';
import {
  type AgentExecutor,
  DefaultRequestHandler,
  type TaskStore,
} from '@a2a-js/sdk/server';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type Type,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { AgentExtensions } from '../domain/agent-extensions';
import {
  type A2aAgent,
  type A2aAgentCardOverrides,
  type A2aAgentConfig,
  A2aAgentDeclaration,
  type A2aSkill,
  type A2aSkillConfig,
} from './a2a-agent.decorator';
import { A2aCallers } from './a2a-callers';
import { A2aModuleOptions } from './a2a-module.options';
import { CallerScopedExecutor } from './caller-scoped.executor';
import { ExtensionAwareAgentExecutor } from './extension-aware.executor';
import {
  type A2aExecutorFactory,
  LazyAgentExecutor,
} from './lazy-agent.executor';

export interface RegisteredAgent {
  config: A2aAgentConfig;
  executor: AgentExecutor | A2aExecutorFactory;
  hostedExecutor: AgentExecutor;
  taskStore: TaskStore;
  skills: A2aSkillConfig[];
  cardOverrides: A2aAgentCardOverrides;
  card: AgentCard;
  requestHandler: DefaultRequestHandler;
  providerClass: Type<A2aAgent>;
}

export class UnknownAgentReferenceError extends Error {
  constructor(
    readonly referenceId: string,
    readonly known: string[],
  ) {
    super(
      `No A2A agent is registered under \`${A2aRegistry.REFERENCE_PARAM}=${referenceId}\`. ${
        known.length
          ? `Known references: ${known.join(', ')}.`
          : 'This server hosts a single agent, reachable without a reference.'
      }`,
    );
    this.name = 'UnknownAgentReferenceError';
  }
}

@Injectable()
export class A2aRegistry implements OnModuleInit {
  static readonly REFERENCE_PARAM = 'referenceId';

  private static readonly CARD_DEFAULTS = {
    version: '1.0.0',
    provider: undefined,
    capabilities: undefined,
    securitySchemes: {},
    securityRequirements: [],
    signatures: [],
  } satisfies A2aAgentCardOverrides;

  private readonly logger = new Logger(A2aRegistry.name);
  private readonly agents: RegisteredAgent[] = [];
  private readonly byReference = new Map<string, RegisteredAgent>();
  private readonly extensions = new AgentExtensions();
  private rootAgent!: RegisteredAgent;

  constructor(
    @Inject(A2aModuleOptions) private readonly options: A2aModuleOptions,
    private readonly moduleRef: ModuleRef,
    private readonly callers: A2aCallers = new A2aCallers(),
  ) {}

  async onModuleInit(): Promise<void> {
    await this.discoverAgents();
    this.indexAgents();
    for (const agent of this.agents) {
      agent.card = this.buildAgentCard(agent);
      this.assertDiscoverable(agent);
      agent.hostedExecutor = new ExtensionAwareAgentExecutor(
        new CallerScopedExecutor(
          this.callers,
          LazyAgentExecutor.of(agent.executor),
        ),
        this.extensions,
      );
      agent.requestHandler = this.buildRequestHandler(agent);
    }
    this.logger.log(
      `A2A Registry initialized with ${this.agents.length} agent(s): ${this.agents
        .map((agent) => `${agent.card.name} (${this.describeReference(agent)})`)
        .join(', ')}`,
    );
  }

  getAgentCard(referenceId?: string | null): AgentCard {
    return this.resolveAgent(referenceId).card;
  }

  getRequestHandler(referenceId?: string | null): DefaultRequestHandler {
    return this.resolveAgent(referenceId).requestHandler;
  }

  resolveProvider(providerClass: Type<A2aAgent>): RegisteredAgent {
    const agent = this.agents.find(
      (registered) => registered.providerClass === providerClass,
    );
    if (!agent) {
      throw new Error(
        `A2aRegistry: ${providerClass.name} is not one of the agentProviders this module was given.`,
      );
    }
    return agent;
  }

  resolveAgent(referenceId?: string | null): RegisteredAgent {
    if (!referenceId) return this.rootAgent;
    const agent = this.byReference.get(referenceId);
    if (!agent) {
      throw new UnknownAgentReferenceError(referenceId, [
        ...this.byReference.keys(),
      ]);
    }
    return agent;
  }

  getAgents(): RegisteredAgent[] {
    return [...this.agents];
  }

  static withReference(url: string, referenceId?: string | null): string {
    if (!referenceId) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${A2aRegistry.REFERENCE_PARAM}=${encodeURIComponent(referenceId)}`;
  }

  static mergeSkills(
    declared: readonly A2aSkill[],
    contributed: readonly A2aSkill[],
  ): A2aSkillConfig[] {
    const byId = new Map<string, A2aSkillConfig>();
    for (const skill of A2aAgentDeclaration.skillsOf([
      ...declared,
      ...contributed,
    ])) {
      if (!byId.has(skill.id)) byId.set(skill.id, skill);
    }
    return [...byId.values()];
  }

  private describeReference(agent: RegisteredAgent): string {
    return agent.config.referenceId
      ? `${A2aRegistry.REFERENCE_PARAM}=${agent.config.referenceId}`
      : 'root';
  }

  private assertDiscoverable(agent: RegisteredAgent): void {
    const closed = this.options.allowAnonymous !== true;
    const declares =
      Object.keys(agent.card?.securitySchemes ?? {}).length > 0 &&
      (agent.card?.securityRequirements ?? []).length > 0;

    if (closed && !declares) {
      throw new Error(
        `A2A agent "${agent.card?.name}" refuses anonymous callers but its card ` +
          'declares no way to authenticate. Give it a `securitySchemes` entry AND a ' +
          '`securityRequirements` alternative that selects it, or set ' +
          '`allowAnonymous: true` if the agent really is open.',
      );
    }
  }

  private async discoverAgents(): Promise<void> {
    for (const ProviderClass of this.options.agentProviders ?? []) {
      const config = A2aAgentDeclaration.of(ProviderClass);
      if (!config) {
        this.logger.warn(
          `${ProviderClass.name} is registered as an agent provider but carries no ` +
            '@A2aAgent metadata, skipping. (A subclass must declare its own.)',
        );
        continue;
      }

      const instance = await this.instanceOf(ProviderClass);
      if (!instance) continue;

      this.agents.push({
        config,
        ...this.readContract(ProviderClass, instance, config),
        providerClass: ProviderClass,
        hostedExecutor: undefined as unknown as AgentExecutor,
        card: undefined as unknown as AgentCard,
        requestHandler: undefined as unknown as DefaultRequestHandler,
      });

      this.logger.log(
        `Discovered agent: ${config.name ?? config.id} (${config.id}) from ${ProviderClass.name}`,
      );
    }
  }

  private async instanceOf(
    ProviderClass: Type<A2aAgent>,
  ): Promise<A2aAgent | undefined> {
    try {
      return this.moduleRef.get(ProviderClass, { strict: false });
    } catch {
      try {
        return await this.moduleRef.resolve(ProviderClass, undefined, {
          strict: false,
        });
      } catch (error) {
        this.logger.warn(
          `Could not resolve agent provider ${ProviderClass.name}. Make sure it is registered as a provider.`,
          error instanceof Error ? error.stack : String(error),
        );
        return undefined;
      }
    }
  }

  private readContract(
    ProviderClass: Type<A2aAgent>,
    instance: A2aAgent,
    config: A2aAgentConfig,
  ): Pick<
    RegisteredAgent,
    'executor' | 'taskStore' | 'skills' | 'cardOverrides'
  > {
    const executor = instance?.executor;
    if (!LazyAgentExecutor.isExecutor(executor)) {
      throw new Error(
        `A2aRegistry: ${ProviderClass.name}.executor is not an AgentExecutor. It must ` +
          'hand over the executor that drives the turn (e.g. ' +
          '`new ReactAgentExecutor(agent)`), or a function that builds one, not the agent itself.',
      );
    }

    const taskStore = instance?.taskStore;
    if (!taskStore) {
      throw new Error(
        `A2aRegistry: ${ProviderClass.name}.taskStore is empty, so this agent's A2A ` +
          'tasks have nowhere durable to live. A LangChain agent returns a ' +
          '`LangChainTaskStore` over the same store + checkpointer its graph was ' +
          'compiled with.',
      );
    }

    return {
      executor,
      taskStore,
      skills: A2aRegistry.mergeSkills(
        config.skills ?? [],
        instance.skills ?? [],
      ),
      cardOverrides: instance.card ?? {},
    };
  }

  private indexAgents(): void {
    if (this.agents.length === 0) {
      throw new Error(
        'A2aRegistry: No agents discovered. Register at least one @A2aAgent provider.',
      );
    }

    for (const agent of this.agents) {
      const reference = agent.config.referenceId;
      if (!reference) continue;
      const clash = this.byReference.get(reference);
      if (clash) {
        throw new Error(
          `A2aRegistry: two agents claim \`${A2aRegistry.REFERENCE_PARAM}=${reference}\` ` +
            `(${clash.config.id} and ${agent.config.id}). A reference addresses exactly one agent.`,
        );
      }
      this.byReference.set(reference, agent);
    }

    const rootCandidates = this.agents.filter(
      (agent) => !agent.config.referenceId,
    );
    if (rootCandidates.length > 1) {
      throw new Error(
        `A2aRegistry: ${rootCandidates.length} agents declare no \`referenceId\` ` +
          `(${rootCandidates.map((agent) => agent.config.id).join(', ')}), so more than one ` +
          'claims the root agent card. Give all but one a `referenceId`.',
      );
    }

    this.rootAgent = rootCandidates[0] ?? this.agents[0];
  }

  private buildAgentCard(agent: RegisteredAgent): AgentCard {
    const cardConfig = {
      ...A2aRegistry.CARD_DEFAULTS,
      ...this.options.card,
      ...(agent.config.card ?? {}),
      ...agent.cardOverrides,
    };
    const basePath = this.options.basePath ?? 'a2a';
    const baseUrl =
      this.options.baseUrl ?? process.env.BASE_URL ?? 'http://localhost:3333';
    const origin = new URL(baseUrl).origin;
    const reference = agent.config.referenceId;

    const skills: AgentSkill[] = agent.skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      tags: skill.tags ?? [],
      examples: skill.examples ?? [],
      inputModes: skill.inputModes ?? ['text'],
      outputModes: skill.outputModes ?? ['text'],
      securityRequirements: [],
    }));

    const interfaces = this.options.card?.supportedInterfaces ?? [
      {
        url: `${origin}/${basePath}/v1/jsonrpc`,
        protocolBinding: 'JSONRPC',
        tenant: '',
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
      {
        url: `${origin}/${basePath}/rest`,
        protocolBinding: 'HTTP+JSON',
        tenant: '',
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
    ];

    return {
      ...cardConfig,
      name: agent.config.name ?? cardConfig.name ?? agent.config.id,
      description: agent.config.description ?? cardConfig.description ?? '',
      skills,
      defaultInputModes: cardConfig.defaultInputModes ?? ['text'],
      defaultOutputModes: cardConfig.defaultOutputModes ?? ['text'],
      capabilities: {
        streaming: true,
        pushNotifications: false,
        extendedAgentCard: false,
        ...(cardConfig.capabilities ?? {}),
        extensions: this.extensions.descriptors(
          new Set(agent.skills.flatMap((skill) => skill.extensions ?? [])),
        ),
      } as AgentCapabilities,
      supportedInterfaces: interfaces.map((iface) => ({
        ...iface,
        url: A2aRegistry.withReference(iface.url, reference),
      })),
    };
  }

  private buildRequestHandler(agent: RegisteredAgent): DefaultRequestHandler {
    this.logger.log(
      `A2A task store for ${agent.config.id}: ${agent.taskStore.constructor.name}`,
    );
    return new DefaultRequestHandler(
      agent.card,
      agent.taskStore,
      agent.hostedExecutor,
    );
  }
}
