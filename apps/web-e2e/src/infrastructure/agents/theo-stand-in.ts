import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';

import type { TheoInvocation } from './theo-invocation';

type AgUiEvent = { type: string } & Record<string, unknown>;

/**
 * **Theo, played by a script, where the web expects the AgentCore runtime.**
 *
 * The browser suite runs no model and no AgentCore, so what stands at `THEO_AGENT_URL` is an AG-UI
 * server that answers every run the way Theo does when it hands a question to the posts agent: a
 * `send_message_to_a2a_agent` call, the posts agent as an AG-UI subagent of it, the call's result and
 * Theo's own answer. What it checks is what the web owes the real one: a bearer this run's web signed,
 * for the agents' audiences, and the AgentCore session header. It keeps every invocation for the
 * specs, at `GET /received`.
 */
export class TheoStandIn {
  static readonly AUDIENCES = [
    'http://theo.e2e/',
    'http://posts-agent.e2e/',
    'http://mcp.e2e/',
  ];
  static readonly DELEGATE = 'Posts Manager';
  static readonly DELEGATION_TOOL = 'send_message_to_a2a_agent';
  private static readonly SESSION_HEADER =
    'x-amzn-bedrock-agentcore-runtime-session-id';
  private static readonly STREAM_PACE_MS = 40;

  private readonly received: TheoInvocation[] = [];
  private readonly keys: ReturnType<typeof createRemoteJWKSet>;

  private constructor(
    private readonly server: Server,
    readonly url: string,
    webUrl: string,
  ) {
    this.keys = createRemoteJWKSet(new URL('/api/auth/jwks', webUrl));
  }

  static answerTo(asked: string): string {
    return `Theo heard “${asked}”, and the posts agent answered for you.`;
  }

  static delegateSays(subject: string): string {
    return `The caller is ${subject}.`;
  }

  static async listen(port: number, webUrl: string): Promise<TheoStandIn> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve());
    });
    const { port: bound } = server.address() as AddressInfo;
    const standIn = new TheoStandIn(
      server,
      `http://127.0.0.1:${bound}`,
      webUrl,
    );
    server.on('request', (request, response) => {
      void standIn.handle(request, response);
    });
    return standIn;
  }

  async close(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method === 'GET' && request.url === '/received') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(this.received));
      return;
    }
    if (request.method === 'POST' && request.url?.startsWith('/invocations')) {
      await this.invoke(request, response);
      return;
    }
    response.writeHead(404).end();
  }

  private async invoke(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const input = JSON.parse(await TheoStandIn.bodyOf(request)) as {
      threadId: string;
      runId: string;
      messages: { role: string; content?: unknown }[];
    };
    const token =
      request.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? '';
    const signedByTheWeb = await jwtVerify(token, this.keys, {
      audience: TheoStandIn.AUDIENCES[0],
    }).then(
      () => true,
      () => false,
    );
    const asked = String(
      input.messages.filter((message) => message.role === 'user').at(-1)
        ?.content ?? '',
    );
    const session = request.headers[TheoStandIn.SESSION_HEADER];
    const invocation = {
      claims: token ? decodeJwt(token) : {},
      signedByTheWeb,
      threadId: input.threadId,
      session: typeof session === 'string' ? session : null,
      asked,
    } satisfies TheoInvocation;
    this.received.push(invocation);

    if (!signedByTheWeb) {
      response.writeHead(401, { 'Content-Type': 'text/event-stream' });
      response.end(
        TheoStandIn.sse({
          type: 'RUN_ERROR',
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        }),
      );
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    });
    for (const event of TheoStandIn.runOf(input, invocation)) {
      response.write(TheoStandIn.sse(event));
      await new Promise((resolve) =>
        setTimeout(resolve, TheoStandIn.STREAM_PACE_MS),
      );
    }
    response.end();
  }

  private static runOf(
    { threadId, runId }: { threadId: string; runId: string },
    invocation: TheoInvocation,
  ): AgUiEvent[] {
    const call = `call-${runId}`;
    const said = TheoStandIn.delegateSays(String(invocation.claims.sub));
    const answer = TheoStandIn.answerTo(invocation.asked);
    return [
      { type: 'RUN_STARTED', threadId, runId },
      {
        type: 'TOOL_CALL_START',
        toolCallId: call,
        toolCallName: TheoStandIn.DELEGATION_TOOL,
        parentMessageId: `theo-${runId}`,
      },
      {
        type: 'TOOL_CALL_ARGS',
        toolCallId: call,
        delta: JSON.stringify({
          agentName: TheoStandIn.DELEGATE,
          task: `Tell me who is asking: ${invocation.asked}`,
        }),
      },
      { type: 'TOOL_CALL_END', toolCallId: call },
      {
        type: 'SUBAGENT_STARTED',
        subagentRunId: call,
        name: TheoStandIn.DELEGATE,
        parentToolCallId: call,
      },
      {
        type: 'TEXT_MESSAGE_START',
        messageId: `${call}:said`,
        role: 'assistant',
        subagentRunId: call,
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: `${call}:said`,
        delta: said,
        subagentRunId: call,
      },
      {
        type: 'TEXT_MESSAGE_END',
        messageId: `${call}:said`,
        subagentRunId: call,
      },
      {
        type: 'SUBAGENT_FINISHED',
        subagentRunId: call,
        result: said,
        outcome: { type: 'success' },
      },
      {
        type: 'TOOL_CALL_RESULT',
        messageId: `${call}:result`,
        toolCallId: call,
        role: 'tool',
        content: said,
      },
      {
        type: 'TEXT_MESSAGE_START',
        messageId: `answer-${runId}`,
        role: 'assistant',
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: `answer-${runId}`,
        delta: answer,
      },
      { type: 'TEXT_MESSAGE_END', messageId: `answer-${runId}` },
      { type: 'RUN_FINISHED', threadId, runId },
    ];
  }

  private static sse(event: AgUiEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
  }

  private static async bodyOf(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  }
}
