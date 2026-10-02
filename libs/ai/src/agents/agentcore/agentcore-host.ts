import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Logger, OnApplicationShutdown } from '@nestjs/common';

import type { AgentCaller, AgentCallerResolver } from '../callers/agent-caller';
import type { AgentCallers } from '../callers/agent-callers';

export interface AgentAdmission {
  readonly resolveUser?: AgentCallerResolver;
  readonly allowAnonymous?: boolean;
}

export interface AgentCoreAddress {
  readonly port?: number;
  readonly host?: string;
}

export abstract class AgentCoreHost implements OnApplicationShutdown {
  protected abstract readonly logger: Logger;

  private server?: Server;

  protected constructor(
    protected readonly callers: AgentCallers,
    private readonly admission: AgentAdmission,
    private readonly address: AgentCoreAddress,
    private readonly contractPort: number,
  ) {}

  get port(): number {
    return this.address.port ?? this.contractPort;
  }

  abstract handler(): RequestListener;

  protected abstract describe(): string;

  async listen(): Promise<Server> {
    const server = createServer(this.handler());
    const host = this.address.host ?? '0.0.0.0';
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });
    this.server = server;
    const { port } = server.address() as AddressInfo;
    this.logger.log(`${this.describe()} listening on ${host}:${port}`);
    return server;
  }

  async onApplicationShutdown(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = undefined;
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  protected async admit(
    request: IncomingMessage,
    response: ServerResponse,
    serve: () => void,
    refuse: (response: ServerResponse) => void,
  ): Promise<void> {
    const caller = await this.callerOf(request);
    if (!caller && this.admission.allowAnonymous !== true) {
      refuse(response);
      return;
    }
    this.callers.run(caller, serve);
  }

  private async callerOf(
    request: IncomingMessage,
  ): Promise<AgentCaller | undefined> {
    try {
      return (await this.admission.resolveUser?.(request.headers)) ?? undefined;
    } catch (error) {
      this.logger.warn(
        `caller refused: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }
}
