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

export class RemoteA2aAgents {
  private constructor(private readonly agents: readonly RemoteA2aAgent[]) {}

  static async connect(
    urls: readonly string[],
    fetchImpl: typeof fetch = fetch,
  ): Promise<RemoteA2aAgents> {
    const resolver = new DefaultAgentCardResolver({ fetchImpl });
    const factory = new ClientFactory(
      ClientFactoryOptions.createFrom(ClientFactoryOptions.default, {
        transports: [new JsonRpcTransportFactory({ fetchImpl })],
        cardResolver: resolver,
      }),
    );
    return new RemoteA2aAgents(
      await Promise.all(
        urls.map(async (url) => {
          const card = await resolver.resolve(url);
          return {
            name: card.name,
            description: card.description,
            card,
            client: await factory.createFromAgentCard(card),
          };
        }),
      ),
    );
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
