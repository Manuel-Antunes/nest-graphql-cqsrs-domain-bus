import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AbstractAgent } from '@ag-ui/client';
import {
  type BaseEvent,
  EventType,
  type RunAgentInput,
  type RunErrorEvent,
} from '@ag-ui/core';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { EventEncoder } from '@ag-ui/encoder';
import { type INestApplication, Logger, type Type } from '@nestjs/common';

import { AgentCoreHealth } from '../../agents/agentcore/agentcore-health';
import {
  type AgentContext,
  AgentContexts,
} from '../../agents/context/agent-context';
import { AgentRunContext } from '../../agents/context/agent-run-context';
import { AgUiRegistry } from '../server/ag-ui.registry';
import type { AgUiAgent } from '../server/ag-ui-agent.decorator';
import { AgUiModuleOptions } from '../server/ag-ui-module.options';

export interface AgentCoreAgUiServerOptions {
  readonly agent?: Type<AgUiAgent> | string;
}

export class AgentCoreAgUiServer {
  static readonly CONTRACT_PORT = 8080;
  static readonly INVOCATIONS_PATH = '/invocations';
  static readonly MAX_BODY_BYTES = 10 * 1024 * 1024;

  private readonly logger = new Logger(AgentCoreAgUiServer.name);
  private readonly health = new AgentCoreHealth();

  constructor(
    private readonly app: INestApplication,
    private readonly options: AgentCoreAgUiServerOptions = {},
  ) {}

  async listen(
    port = AgentCoreAgUiServer.CONTRACT_PORT,
    host = '0.0.0.0',
  ): Promise<void> {
    this.app.use(
      (
        request: IncomingMessage,
        response: ServerResponse,
        next: (error?: unknown) => void,
      ) => this.serve(request, response, next),
    );
    await this.app.listen(port, host);
    this.logger.log(`AgentCore's AG-UI contract on ${host}:${port}`);
  }

  private serve(
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ): void {
    const path = new URL(request.url ?? '/', 'http://agent').pathname;
    if (request.method === 'GET' && path === AgentCoreHealth.PING_PATH) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(this.health.status()));
      return;
    }
    if (
      request.method === 'POST' &&
      path === AgentCoreAgUiServer.INVOCATIONS_PATH
    ) {
      void this.invoke(request, response);
      return;
    }
    next();
  }

  private async invoke(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const admission = this.app.get(AgUiModuleOptions, { strict: false });
    const { agent } = this.app
      .get(AgUiRegistry, { strict: false })
      .resolve(this.options.agent);
    const context = await AgentContexts.of(admission, request, this.logger);
    if (!AgentContexts.admits(admission, context)) {
      AgentCoreAgUiServer.refuse(response);
      return;
    }
    await this.run(agent, request, response, context);
  }

  private async run(
    agent: AbstractAgent,
    request: IncomingMessage,
    response: ServerResponse,
    context: AgentContext | undefined,
  ): Promise<void> {
    const encoder = new EventEncoder({ accept: request.headers.accept });
    const parsed = RunAgentInputSchema.safeParse(
      await AgentCoreAgUiServer.bodyOf(request).catch(() => undefined),
    );
    if (!parsed.success) {
      AgentCoreAgUiServer.fail(response, 400, {
        type: EventType.RUN_ERROR,
        code: 'VALIDATION_ERROR',
        message: `The request is not a RunAgentInput: ${parsed.error.message}`,
      });
      return;
    }
    const input = parsed.data as RunAgentInput;

    response.writeHead(200, {
      'Content-Type': encoder.getContentType(),
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const end = this.health.begin();
    let terminal = false;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      end();
      response.end();
    };
    const write = (event: BaseEvent) => {
      terminal ||=
        event.type === EventType.RUN_FINISHED ||
        event.type === EventType.RUN_ERROR;
      if (!response.writableEnded) response.write(encoder.encodeBinary(event));
    };

    const subscription = AgentRunContext.within(context, () =>
      agent.run(input).subscribe({
        next: write,
        error: (error: unknown) => {
          this.logger.error(
            `run ${input.runId} of thread ${input.threadId} failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
          );
          if (!terminal) {
            write({
              type: EventType.RUN_ERROR,
              message: error instanceof Error ? error.message : String(error),
            } satisfies RunErrorEvent);
          }
          finish();
        },
        complete: finish,
      }),
    );
    response.on('close', () => {
      subscription.unsubscribe();
      finish();
    });
  }

  private static async bodyOf(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += (chunk as Buffer).length;
      if (size > AgentCoreAgUiServer.MAX_BODY_BYTES) {
        throw new Error('The request body is too large.');
      }
      chunks.push(chunk as Buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  private static fail(
    response: ServerResponse,
    status: number,
    event: RunErrorEvent,
    headers: Record<string, string> = {},
  ): void {
    response.writeHead(status, {
      'Content-Type': 'text/event-stream',
      ...headers,
    });
    response.end(new EventEncoder().encodeSSE(event));
  }

  private static refuse(response: ServerResponse): void {
    AgentCoreAgUiServer.fail(
      response,
      401,
      {
        type: EventType.RUN_ERROR,
        code: 'UNAUTHORIZED',
        message:
          'This agent requires an access token of the platform, as a Bearer credential.',
      },
      { 'WWW-Authenticate': 'Bearer' },
    );
  }
}
