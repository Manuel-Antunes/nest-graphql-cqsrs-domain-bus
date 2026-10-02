import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from 'node:http';
import type { AbstractAgent } from '@ag-ui/client';
import {
  type BaseEvent,
  EventType,
  type RunAgentInput,
  type RunErrorEvent,
} from '@ag-ui/core';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { EventEncoder } from '@ag-ui/encoder';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { AgentCoreHost } from '../../agents/agentcore/agentcore-host';
import { AgentCallers } from '../../agents/callers/agent-callers';
import { AgUiRegistry } from '../server/ag-ui.registry';
import { AgUiModuleOptions } from '../server/ag-ui-module.options';
import { AgentCoreAgUiOptions } from './agentcore-ag-ui.options';

@Injectable()
export class AgentCoreAgUiServer extends AgentCoreHost {
  static readonly CONTRACT_PORT = 8080;
  static readonly MAX_BODY_BYTES = 10 * 1024 * 1024;

  protected readonly logger = new Logger(AgentCoreAgUiServer.name);

  private running = 0;

  constructor(
    private readonly registry: AgUiRegistry,
    callers: AgentCallers,
    @Inject(AgUiModuleOptions) agUi: AgUiModuleOptions,
    @Inject(AgentCoreAgUiOptions)
    private readonly options: AgentCoreAgUiOptions,
  ) {
    super(callers, agUi, options, AgentCoreAgUiServer.CONTRACT_PORT);
  }

  handler(): RequestListener {
    const { agent } = this.registry.resolve(this.options.agent);
    return (request, response) => {
      const path = new URL(request.url ?? '/', 'http://agent').pathname;
      if (request.method === 'GET' && path === '/ping') {
        this.ping(response);
        return;
      }
      if (request.method === 'POST' && path === '/invocations') {
        void this.admit(
          request,
          response,
          () => void this.invoke(agent, request, response),
          AgentCoreAgUiServer.refuse,
        );
        return;
      }
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: `No route for ${path}` }));
    };
  }

  protected describe(): string {
    return `AG-UI agent "${this.registry.resolve(this.options.agent).config.id}"`;
  }

  private ping(response: ServerResponse): void {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({ status: this.running > 0 ? 'HealthyBusy' : 'Healthy' }),
    );
  }

  private async invoke(
    agent: AbstractAgent,
    request: IncomingMessage,
    response: ServerResponse,
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

    this.running += 1;
    let terminal = false;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.running -= 1;
      response.end();
    };
    const write = (event: BaseEvent) => {
      terminal ||=
        event.type === EventType.RUN_FINISHED ||
        event.type === EventType.RUN_ERROR;
      if (!response.writableEnded) response.write(encoder.encodeBinary(event));
    };

    const subscription = agent.run(input).subscribe({
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
    });
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

  private static refuse(this: void, response: ServerResponse): void {
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
