import type { IncomingMessage, ServerResponse } from 'node:http';
import { A2A_PROTOCOL_VERSION, type AgentCard } from '@a2a-js/sdk';
import { duplicateInterfacesForLegacy } from '@a2a-js/sdk/compat/v0_3';
import { DefaultRequestHandler, type User } from '@a2a-js/sdk/server';
import {
  agentCardHandler,
  jsonRpcHandler,
  UserBuilder,
} from '@a2a-js/sdk/server/express';
import { type INestApplication, Logger, type Type } from '@nestjs/common';
import {
  agentCoreRuntimeUrl,
  bedrockCallContextBuilder,
} from 'bedrock-agentcore/runtime/a2a';
import express, { type Express, type Request } from 'express';

import { AgentCoreHealth } from '../../agents/agentcore/agentcore-health';
import {
  type AgentContext,
  AgentContexts,
} from '../../agents/context/agent-context';
import type { A2aAgent } from '../server/a2a-agent.decorator';
import { A2aAgentResolver } from '../server/a2a-agent.resolver';
import { A2aModuleOptions } from '../server/a2a-module.options';
import { A2aTenancy, TenantScopedCallContext } from '../server/a2a-tenancy';

export interface AgentCoreA2aServerOptions {
  readonly agent?: Type<A2aAgent>;
  readonly url?: string;
}

type AdmittedRequest = Request & { agentContext?: AgentContext };

export class AgentCoreA2aServer {
  static readonly CONTRACT_PORT = 9000;
  static readonly CARD_PATH = '/.well-known/agent-card.json';

  private readonly logger = new Logger(AgentCoreA2aServer.name);
  private readonly health = new AgentCoreHealth();
  private served?: Express;

  constructor(
    private readonly app: INestApplication,
    private readonly options: AgentCoreA2aServerOptions = {},
  ) {}

  async listen(
    port = AgentCoreA2aServer.CONTRACT_PORT,
    host = '0.0.0.0',
  ): Promise<void> {
    this.app.use(
      (
        request: IncomingMessage,
        response: ServerResponse,
        next: (error?: unknown) => void,
      ) => {
        this.served ??= this.contract(port);
        this.served(request as Request, response as never, next);
      },
    );
    await this.app.listen(port, host);
    this.logger.log(`AgentCore's A2A contract on ${host}:${port}`);
  }

  static cardServedAt(card: AgentCard, url: string, tenant = ''): AgentCard {
    return {
      ...card,
      supportedInterfaces: duplicateInterfacesForLegacy(
        [
          {
            url,
            protocolBinding: 'JSONRPC',
            tenant,
            protocolVersion: A2A_PROTOCOL_VERSION,
          },
        ],
        ['JSONRPC'],
      ),
    };
  }

  private contract(port: number): Express {
    const admission = this.app.get(A2aModuleOptions, { strict: false });
    const { card, executor, taskStore } = this.app
      .get(A2aAgentResolver, { strict: false })
      .resolve(this.options.agent);
    const url =
      this.options.url ?? agentCoreRuntimeUrl() ?? `http://localhost:${port}/`;
    const requestHandler = new DefaultRequestHandler(
      AgentCoreA2aServer.cardServedAt(card, url),
      taskStore,
      this.health.tracking(executor),
    );
    const admit = async (request: AdmittedRequest) => {
      request.agentContext ??= await AgentContexts.of(
        admission,
        request,
        this.logger,
      );
      return request.agentContext;
    };
    return express()
      .get(AgentCoreHealth.PING_PATH, (_request, response) => {
        response.json(this.health.status());
      })
      .use(AgentCoreA2aServer.CARD_PATH, (request, response, next) => {
        void admit(request).then((context) =>
          agentCardHandler({
            agentCardProvider: async () =>
              AgentCoreA2aServer.cardServedAt(
                card,
                url,
                A2aTenancy.tenantOf(context),
              ),
            cache: { maxAge: 0 },
            legacyCompat: { enabled: true },
          })(request, response, next),
        );
      })
      .post(
        '/',
        (request, response, next) => {
          void admit(request).then((context) => {
            if (!AgentContexts.admits(admission, context)) {
              AgentCoreA2aServer.refuse(response);
              return;
            }
            next();
          });
        },
        jsonRpcHandler({
          requestHandler,
          userBuilder: async (request) =>
            (request as AdmittedRequest).agentContext ??
            (await UserBuilder.noAuthentication()),
          contextBuilder: (options) =>
            TenantScopedCallContext.of(
              bedrockCallContextBuilder(options),
              options.user as User | undefined,
            ),
          legacyCompat: { enabled: true },
        }),
      );
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
