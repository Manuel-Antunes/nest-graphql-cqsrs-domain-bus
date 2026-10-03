import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  A2A_PROTOCOL_VERSION,
  A2A_VERSION_HEADER,
  AGENT_CARD_PATH,
  type AgentCard,
  AgentCard as AgentCardCodec,
  Extensions,
  HTTP_EXTENSION_HEADER,
  type ListTasksRequest,
  type SendMessageRequest,
} from '@a2a-js/sdk';
import {
  JsonRpcTransportHandler,
  ServerCallContext,
  type User,
  validateVersion,
} from '@a2a-js/sdk/server';
import {
  Inject,
  Injectable,
  Logger,
  type NestMiddleware,
} from '@nestjs/common';

import { AgentContexts } from '../../agents/context/agent-context';
import { A2aRegistry, UnknownAgentReferenceError } from './a2a.registry';
import { A2aModuleOptions } from './a2a-module.options';

class UnauthenticatedError extends Error {
  constructor() {
    super('Unauthenticated');
    this.name = 'UnauthenticatedError';
  }
}

@Injectable()
export class A2aProtocolMiddleware implements NestMiddleware {
  private static readonly SSE_HEADERS = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  } as const;

  private readonly logger = new Logger(A2aProtocolMiddleware.name);
  private readonly transports = new Map<string, JsonRpcTransportHandler>();

  constructor(
    @Inject(A2aRegistry) private readonly registry: A2aRegistry,
    @Inject(A2aModuleOptions) private readonly options: A2aModuleOptions,
  ) {}

  async use(
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void,
  ): Promise<void> {
    const url = new URL(
      (req as { originalUrl?: string }).originalUrl ?? req.url ?? '/',
      'http://localhost',
    );
    const path = url.pathname.replace(/\/+$/, '');
    const method = (req.method ?? 'GET').toUpperCase();
    const reference = url.searchParams.get(A2aRegistry.REFERENCE_PARAM);

    try {
      if (
        method === 'GET' &&
        (path.endsWith(`/${AGENT_CARD_PATH}`) || path.endsWith('/rest/v1/card'))
      ) {
        return A2aProtocolMiddleware.sendJson(
          res,
          200,
          this.cardForTheWire(reference),
        );
      }
      if (method === 'POST' && path.endsWith('/v1/jsonrpc')) {
        return await this.handleJsonRpc(req, res, reference);
      }
      if (method === 'POST' && path.endsWith('/rest/v1/message::stream')) {
        return await this.handleRestStream(req, res, reference);
      }
      if (method === 'POST' && path.endsWith('/rest/v1/message::send')) {
        return await this.handleRestSend(req, res, reference);
      }
      if (method === 'GET' && path.endsWith('/rest/v1/tasks')) {
        return await this.handleListTasks(req, res, url, reference);
      }

      const taskMatch = /\/rest\/v1\/tasks\/([^/]+)$/.exec(path);
      if (taskMatch) {
        const [taskId, action] = decodeURIComponent(taskMatch[1]).split(':');
        if (method === 'GET') {
          return await this.handleGetTask(req, res, taskId, reference);
        }
        if (method === 'POST') {
          return await this.handleTaskAction(
            req,
            res,
            taskId,
            action,
            reference,
          );
        }
      }

      return next();
    } catch (error) {
      this.answerFailure(res, error);
    }
  }

  private answerFailure(res: ServerResponse, error: unknown): void {
    if (res.headersSent) {
      res.end();
      return;
    }
    if (error instanceof UnknownAgentReferenceError) {
      A2aProtocolMiddleware.sendJson(res, 404, { error: error.message });
      return;
    }
    if (error instanceof UnauthenticatedError) {
      A2aProtocolMiddleware.sendJson(res, 401, {
        error:
          'This agent requires a credential. See `securitySchemes` on its agent card.',
      });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`A2A middleware error: ${message}`);
    A2aProtocolMiddleware.sendJson(res, 500, { error: message });
  }

  private transportFor(reference: string | null): JsonRpcTransportHandler {
    const key = reference ?? '';
    let transport = this.transports.get(key);
    if (!transport) {
      transport = new JsonRpcTransportHandler(
        this.registry.getRequestHandler(reference),
      );
      this.transports.set(key, transport);
    }
    return transport;
  }

  private cardForTheWire(reference: string | null): unknown {
    return AgentCardCodec.toJSON(this.registry.getAgentCard(reference));
  }

  private async buildContext(req: IncomingMessage): Promise<ServerCallContext> {
    const user = await AgentContexts.of(this.options, req, this.logger);
    if (!AgentContexts.admits(this.options, user)) {
      throw new UnauthenticatedError();
    }

    return new ServerCallContext({
      requestedExtensions: Extensions.parseServiceParameter(
        req.headers[HTTP_EXTENSION_HEADER.toLowerCase()] as string | undefined,
      ),
      user: user ?? { isAuthenticated: false, userName: '' },
      requestedVersion:
        (req.headers[A2A_VERSION_HEADER.toLowerCase()] as string | undefined) ??
        A2A_PROTOCOL_VERSION,
    });
  }

  private honourable(context: ServerCallContext, card: AgentCard): string[] {
    const requested = context.requestedExtensions ?? [];
    const declared = new Set(
      (card.capabilities?.extensions ?? []).map((extension) => extension.uri),
    );
    return requested.filter((uri) => declared.has(uri));
  }

  private echoActivated(res: ServerResponse, context: ServerCallContext): void {
    const activated = context.activatedExtensions;
    if (activated?.length && !res.headersSent) {
      res.setHeader(
        HTTP_EXTENSION_HEADER,
        Extensions.toServiceParameter(activated),
      );
    }
  }

  private async handleJsonRpc(
    req: IncomingMessage,
    res: ServerResponse,
    reference: string | null,
  ): Promise<void> {
    const body = (await A2aProtocolMiddleware.readJsonBody(req)) as {
      id?: unknown;
    };
    const card = this.registry.getAgentCard(reference);
    const context = await this.buildContext(req);
    validateVersion(context.requestedVersion, card);

    const result = await this.transportFor(reference).handle(
      body as never,
      context,
    );

    if (A2aProtocolMiddleware.isAsyncIterable(result)) {
      const honoured = this.honourable(context, card);
      if (honoured.length) {
        res.setHeader(
          HTTP_EXTENSION_HEADER,
          Extensions.toServiceParameter(honoured),
        );
      }
      await this.stream(res, result, (message) => ({
        jsonrpc: '2.0',
        id: body?.id ?? null,
        error: { code: -32603, message },
      }));
      return;
    }

    this.echoActivated(res, context);
    A2aProtocolMiddleware.sendJson(res, 200, result);
  }

  private toSendMessageRequest(body: unknown): SendMessageRequest {
    const payload = (body ?? {}) as Partial<SendMessageRequest> & {
      tenant?: string;
    };
    return {
      tenant: payload.tenant ?? '',
      message: payload.message,
      configuration: payload.configuration,
      metadata: payload.metadata,
    };
  }

  private async handleRestStream(
    req: IncomingMessage,
    res: ServerResponse,
    reference: string | null,
  ): Promise<void> {
    const body = await A2aProtocolMiddleware.readJsonBody(req);
    const context = await this.buildContext(req);
    const stream = this.registry
      .getRequestHandler(reference)
      .sendMessageStream(this.toSendMessageRequest(body), context);
    await this.stream(res, stream, (message) => ({ message }));
  }

  private async handleRestSend(
    req: IncomingMessage,
    res: ServerResponse,
    reference: string | null,
  ): Promise<void> {
    const body = await A2aProtocolMiddleware.readJsonBody(req);
    const context = await this.buildContext(req);
    const result = await this.registry
      .getRequestHandler(reference)
      .sendMessage(this.toSendMessageRequest(body), context);
    this.echoActivated(res, context);
    A2aProtocolMiddleware.sendJson(res, 200, result);
  }

  private async handleGetTask(
    req: IncomingMessage,
    res: ServerResponse,
    taskId: string,
    reference: string | null,
  ): Promise<void> {
    const context = await this.buildContext(req);
    const result = await this.registry
      .getRequestHandler(reference)
      .getTask({ tenant: '', id: taskId }, context);
    A2aProtocolMiddleware.sendJson(res, 200, result);
  }

  private async handleListTasks(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    reference: string | null,
  ): Promise<void> {
    const context = await this.buildContext(req);
    const query = url.searchParams;
    const params: ListTasksRequest = {
      tenant: '',
      contextId: query.get('contextId') ?? '',
      status: Number(query.get('status') ?? 0),
      pageSize: query.get('pageSize')
        ? Number(query.get('pageSize'))
        : undefined,
      pageToken: query.get('pageToken') ?? '',
      historyLength: query.get('historyLength')
        ? Number(query.get('historyLength'))
        : undefined,
      statusTimestampAfter: query.get('statusTimestampAfter') ?? undefined,
      includeArtifacts: query.get('includeArtifacts') === 'true',
    };
    const result = await this.registry
      .getRequestHandler(reference)
      .listTasks(params, context);
    A2aProtocolMiddleware.sendJson(res, 200, result);
  }

  private async handleTaskAction(
    req: IncomingMessage,
    res: ServerResponse,
    taskId: string,
    action: string | undefined,
    reference: string | null,
  ): Promise<void> {
    const context = await this.buildContext(req);
    const handler = this.registry.getRequestHandler(reference);

    if (action === 'subscribe') {
      const stream = handler.resubscribe({ tenant: '', id: taskId }, context);
      await this.stream(res, stream);
      return;
    }

    if (action === 'cancel') {
      const result = await handler.cancelTask(
        { tenant: '', id: taskId, metadata: undefined },
        context,
      );
      A2aProtocolMiddleware.sendJson(res, 202, result);
      return;
    }

    A2aProtocolMiddleware.sendJson(res, 404, {
      error: `Action '${action}' not supported on tasks.`,
    });
  }

  private async stream(
    res: ServerResponse,
    events: AsyncIterable<unknown>,
    failureOf?: (message: string) => unknown,
  ): Promise<void> {
    res.writeHead(200, A2aProtocolMiddleware.SSE_HEADERS);
    res.write(': open\n\n');
    try {
      for await (const event of events) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      if (!failureOf) throw error;
      const message = error instanceof Error ? error.message : 'stream error';
      this.logger.error(`SSE stream error: ${message}`);
      res.write(
        `event: error\ndata: ${JSON.stringify(failureOf(message))}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  private static async readJsonBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return {};
    }
  }

  private static sendJson(
    res: ServerResponse,
    status: number,
    body: unknown,
  ): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private static isAsyncIterable(
    value: unknown,
  ): value is AsyncGenerator<unknown> {
    return (
      !!value &&
      typeof (value as AsyncGenerator<unknown>)[Symbol.asyncIterator] ===
        'function'
    );
  }
}
