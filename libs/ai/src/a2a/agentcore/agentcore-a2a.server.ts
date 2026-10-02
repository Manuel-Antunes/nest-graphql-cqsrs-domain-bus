import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from 'node:http';
import { A2A_PROTOCOL_VERSION, type AgentCard } from '@a2a-js/sdk';
import { duplicateInterfacesForLegacy } from '@a2a-js/sdk/compat/v0_3';
import { agentCardHandler } from '@a2a-js/sdk/server/express';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  agentCoreRuntimeUrl,
  bedrockCallContextBuilder,
  buildA2AApp,
} from 'bedrock-agentcore/runtime/a2a';
import express from 'express';

import { AgentCoreHost } from '../../agents/agentcore/agentcore-host';
import { AgentCallers } from '../../agents/callers/agent-callers';
import { A2aAgentResolver } from '../server/a2a-agent.resolver';
import { A2aModuleOptions } from '../server/a2a-module.options';
import { A2aTenancy, TenantScopedCallContext } from '../server/a2a-tenancy';
import { AgentCoreA2aLogger } from './agentcore-a2a.logger';
import { AgentCoreA2aOptions } from './agentcore-a2a.options';

@Injectable()
export class AgentCoreA2aServer extends AgentCoreHost {
  static readonly CONTRACT_PORT = 9000;
  static readonly CARD_PATH = '/.well-known/agent-card.json';

  protected readonly logger = new Logger(AgentCoreA2aServer.name);

  constructor(
    private readonly agents: A2aAgentResolver,
    callers: AgentCallers,
    @Inject(A2aModuleOptions) a2a: A2aModuleOptions,
    @Inject(AgentCoreA2aOptions) private readonly options: AgentCoreA2aOptions,
  ) {
    super(callers, a2a, options, AgentCoreA2aServer.CONTRACT_PORT);
  }

  handler(): RequestListener {
    const { card, executor, taskStore } = this.agents.resolve(
      this.agentReference,
    );
    const url = this.urlOf(this.port);
    const app = buildA2AApp({
      executor,
      taskStore,
      port: this.port,
      agentCard: AgentCoreA2aServer.cardServedAt(card, url),
      contextBuilder: (options) =>
        TenantScopedCallContext.of(
          bedrockCallContextBuilder({
            ...options,
            user: this.callers.current() ?? options.user,
          }),
          this.callers.current(),
        ),
      logger: new AgentCoreA2aLogger(this.logger),
    }) as RequestListener;
    const cards = express().use(
      AgentCoreA2aServer.CARD_PATH,
      agentCardHandler({
        agentCardProvider: async () =>
          AgentCoreA2aServer.cardServedAt(
            card,
            url,
            A2aTenancy.tenantOf(this.callers.current()),
          ),
        cache: { maxAge: 0 },
        legacyCompat: { enabled: true },
      }),
    ) as unknown as RequestListener;
    return (request, response) => {
      if (
        request.method === 'GET' &&
        new URL(request.url ?? '/', 'http://agent').pathname ===
          AgentCoreA2aServer.CARD_PATH
      ) {
        void this.callerOf(request).then((caller) =>
          this.callers.run(caller, () => cards(request, response)),
        );
        return;
      }
      if (request.method !== 'POST') {
        app(request, response);
        return;
      }
      void this.admit(
        request,
        response,
        () => app(request, response),
        AgentCoreA2aServer.refuse,
      );
    };
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

  protected describe(): string {
    return `A2A agent "${this.agents.resolve(this.agentReference).card.name}"`;
  }

  private get agentReference() {
    return this.options.agent ?? this.options.referenceId;
  }

  private urlOf(port: number): string {
    return (
      this.options.url ?? agentCoreRuntimeUrl() ?? `http://localhost:${port}/`
    );
  }

  private static refuse(
    this: void,
    response: ServerResponse<IncomingMessage>,
  ): void {
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
