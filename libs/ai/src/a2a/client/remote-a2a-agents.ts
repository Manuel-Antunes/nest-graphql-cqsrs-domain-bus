import type { AgentCard } from '@a2a-js/sdk';
import {
  type Client,
  ClientFactory,
  ClientFactoryOptions,
  DefaultAgentCardResolver,
  JsonRpcTransportFactory,
} from '@a2a-js/sdk/client';

export interface RemoteA2aAgent {
  readonly name: string;
  readonly description: string;
  readonly card: AgentCard;
  readonly client: Client;
}

export class UnknownRemoteAgentError extends Error {
  constructor(name: string, known: readonly string[]) {
    super(
      `No remote agent is called "${name}". The agents you can reach are: ${known.join(', ')}.`,
    );
    this.name = 'UnknownRemoteAgentError';
  }
}

export interface RemoteA2aAgentsOptions {
  readonly tenantOf?: () => string;
}

export class RemoteA2aAgents {
  private readonly reached = new Map<string, Promise<RemoteA2aAgent>>();

  private constructor(
    private readonly agents: readonly RemoteA2aAgent[],
    private readonly urls: ReadonlyMap<string, string>,
    private readonly resolver: DefaultAgentCardResolver,
    private readonly factory: ClientFactory,
    private readonly tenantOf: () => string,
  ) {
    const tenant = tenantOf();
    for (const agent of agents) {
      this.reached.set(
        RemoteA2aAgents.keyOf(agent.name, tenant),
        Promise.resolve(agent),
      );
    }
  }

  static async connect(
    urls: readonly string[],
    fetchImpl: typeof fetch = fetch,
    { tenantOf = () => '' }: RemoteA2aAgentsOptions = {},
  ): Promise<RemoteA2aAgents> {
    const resolver = new DefaultAgentCardResolver({ fetchImpl });
    const factory = new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        transports: [new JsonRpcTransportFactory({ fetchImpl })],
        cardResolver: resolver,
      }),
    );
    const connected = await Promise.all(
      urls.map(async (url) => ({
        url,
        agent: await RemoteA2aAgents.agentAt(url, resolver, factory),
      })),
    );
    return new RemoteA2aAgents(
      connected.map(({ agent }) => agent),
      new Map(connected.map(({ url, agent }) => [agent.name, url])),
      resolver,
      factory,
      tenantOf,
    );
  }

  async reach(name: string): Promise<RemoteA2aAgent> {
    const agent = this.find(name);
    const key = RemoteA2aAgents.keyOf(agent.name, this.tenantOf());
    const known = this.reached.get(key);
    if (known) return known;
    const reaching = RemoteA2aAgents.agentAt(
      this.urls.get(agent.name) as string,
      this.resolver,
      this.factory,
    ).catch((error: unknown) => {
      this.reached.delete(key);
      throw error;
    });
    this.reached.set(key, reaching);
    return reaching;
  }

  private static async agentAt(
    url: string,
    resolver: DefaultAgentCardResolver,
    factory: ClientFactory,
  ): Promise<RemoteA2aAgent> {
    const card = await resolver.resolve(url);
    return {
      name: card.name,
      description: card.description,
      card,
      client: await factory.createFromAgentCard(card),
    };
  }

  private static keyOf(name: string, tenant: string): string {
    return JSON.stringify([name, tenant]);
  }

  get names(): string[] {
    return this.agents.map((agent) => agent.name);
  }

  find(name: string): RemoteA2aAgent {
    const wanted = name.trim().toLowerCase();
    const agent = this.agents.find(
      (candidate) => candidate.name.toLowerCase() === wanted,
    );
    if (!agent) throw new UnknownRemoteAgentError(name, this.names);
    return agent;
  }

  roster(): string {
    return this.agents
      .map((agent) =>
        [
          `### ${agent.name}`,
          agent.description,
          ...agent.card.skills.map(
            (skill) => `- ${skill.name}: ${skill.description}`,
          ),
        ].join('\n'),
      )
      .join('\n\n');
  }
}
