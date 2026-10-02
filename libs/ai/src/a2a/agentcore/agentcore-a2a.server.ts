import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { A2A_PROTOCOL_VERSION, type AgentCard } from '@a2a-js/sdk';
import { duplicateInterfacesForLegacy } from '@a2a-js/sdk/compat/v0_3';
import type { User } from '@a2a-js/sdk/server';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  agentCoreRuntimeUrl,
  bedrockCallContextBuilder,
  buildA2AApp,
} from 'bedrock-agentcore/runtime/a2a';

import { A2aAgentResolver } from '../server/a2a-agent.resolver';
import { A2aCallers } from '../server/a2a-callers';
import { A2aModuleOptions } from '../server/a2a-module.options';
import { AgentCoreA2aLogger } from './agentcore-a2a.logger';
import { AgentCoreA2aOptions } from './agentcore-a2a.options';

@Injectable()
export class AgentCoreA2aServer implements OnApplicationShutdown {
  static readonly CONTRACT_PORT = 9000;

  private readonly logger = new Logger(AgentCoreA2aServer.name);
  private server?: Server;

  constructor(
    private readonly agents: A2aAgentResolver,
    private readonly callers: A2aCallers,
    @Inject(A2aModuleOptions) private readonly a2a: A2aModuleOptions,
    @Inject(AgentCoreA2aOptions) private readonly options: AgentCoreA2aOptions,
  ) {}

  async listen(): Promise<Server> {
    const server = createServer(this.handler());
    const port = this.options.port ?? AgentCoreA2aServer.CONTRACT_PORT;
    const host = this.options.host ?? '0.0.0.0';
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.server = server;
    const { port: bound } = server.address() as AddressInfo;
    this.logger.log(
      `A2A agent "${this.agents.resolve(this.agentReference).card.name}" listening on ${host}:${bound}`,
    );
    return server;
  }

  handler(): RequestListener {
    const port = this.options.port ?? AgentCoreA2aServer.CONTRACT_PORT;
    const { card, executor, taskStore } = this.agents.resolve(
      this.agentReference,
    );
    const app = buildA2AApp({
      executor,
      taskStore,
      port,
      agentCard: AgentCoreA2aServer.cardServedAt(card, this.urlOf(port)),
      contextBuilder: (options) =>
        bedrockCallContextBuilder({
          ...options,
          user: this.callers.current() ?? options.user,
        }),
      logger: new AgentCoreA2aLogger(this.logger),
    }) as RequestListener;
    return (request, response) => {
      void this.admit(request, response, app);
    };
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  static cardServedAt(card: AgentCard, url: string): AgentCard {
    return {
      ...card,
      supportedInterfaces: duplicateInterfacesForLegacy(
        [
          {
            url,
            protocolBinding: 'JSONRPC',
            tenant: '',
            protocolVersion: A2A_PROTOCOL_VERSION,
          },
        ],
        ['JSONRPC'],
      ),
    };
  }

  private get agentReference() {
    return this.options.agent ?? this.options.referenceId;
  }

  private urlOf(port: number): string {
    return (
      this.options.url ?? agentCoreRuntimeUrl() ?? `http://localhost:${port}/`
    );
  }

  private async admit(
    request: IncomingMessage,
    response: ServerResponse,
    app: RequestListener,
  ): Promise<void> {
    if (request.method !== 'POST') {
      app(request, response);
      return;
    }
    const caller = await this.callerOf(request);
    if (!caller && this.a2a.allowAnonymous !== true) {
      AgentCoreA2aServer.refuse(response);
      return;
    }
    this.callers.run(caller, () => app(request, response));
  }

  private async callerOf(request: IncomingMessage): Promise<User | undefined> {
    try {
      return (
        (await this.a2a.resolveUser?.(
          request.headers as Record<string, string | string[] | undefined>,
        )) ?? undefined
      );
    } catch (error) {
      this.logger.warn(
        `A2A caller refused: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private static refuse(response: ServerResponse): void {
    response.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer',
    });
    response.end(
      JSON.stringify({
        error:
          'This agent requires a credential. See `securitySchemes` on its agent card.',
      }),
    );
  }
}
