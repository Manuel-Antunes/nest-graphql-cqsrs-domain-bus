import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';

import {
  type OpenedPostsApp,
  type PostsAppOpening,
  PostsMcpApp,
} from './posts-mcp-app';
import type { TheoInvocation } from './theo-invocation';

type AgUiEvent = { type: string } & Record<string, unknown>;

interface RunInput {
  threadId: string;
  runId: string;
  messages: { role: string; content?: unknown }[];
  context?: { description?: string; value?: unknown }[];
}

/**
 * **Theo, played by a script, where the web expects the AgentCore runtime.**
 *
 * The browser suite runs no model and no AgentCore, so what stands at `THEO_AGENT_URL` is an AG-UI
 * server that answers every run the way Theo does when it hands a question to the posts agent: a
 * `send_message_to_a2a_agent` call, the posts agent as an AG-UI subagent of it, the call's result and
 * Theo's own answer. What it checks is what the web owes the real one: a bearer this run's web signed,
 * for the agents' audiences, and the AgentCore session header. It keeps every invocation for the
 * specs, at `GET /received`, with the A2UI catalogs the web declared that can draw an `McpApp`.
 *
 * A question a spec scripted with `POST /openings` is answered the way the posts agent answers when
 * its model opens the posts MCP App: the opening tool called on the real MCP server, as the caller,
 * and the delegation's result `{ a2ui_operations, answer }` — an A2UI surface on the catalog the web
 * declared, whose root `McpApp` names the server, the `ui://` resource, the tool, its input and its
 * result. Only the model's choice is scripted.
 */
export class TheoStandIn {
  static readonly AUDIENCES = [
    'http://theo.e2e/',
    'http://posts-agent.e2e/',
    PostsMcpApp.RESOURCE,
  ];
  static readonly DELEGATE = 'Posts Manager';
  static readonly DELEGATION_TOOL = 'send_message_to_a2a_agent';
  private static readonly SESSION_HEADER =
    'x-amzn-bedrock-agentcore-runtime-session-id';
  private static readonly MCP_APP_COMPONENT = 'McpApp';
  private static readonly A2UI_VERSION = 'v0.9';
  private static readonly STREAM_PACE_MS = 40;

  private readonly received: TheoInvocation[] = [];
  private readonly openings = new Map<string, PostsAppOpening>();
  private readonly keys: ReturnType<typeof createRemoteJWKSet>;

  private constructor(
    private readonly server: Server,
    readonly url: string,
    webUrl: string,
    private readonly postsApp: PostsMcpApp,
  ) {
    this.keys = createRemoteJWKSet(new URL('/api/auth/jwks', webUrl));
  }

  static answerTo(asked: string): string {
    return `Theo heard “${asked}”, and the posts agent answered for you.`;
  }

  static delegateSays(subject: string): string {
    return `The caller is ${subject}.`;
  }

  static delegateOpens(tool: string): string {
    return `The ${PostsMcpApp.NAME} app is open on your screen with what ${tool} returned: act on it there.`;
  }

  static answerOpening(tool: string): string {
    return `Theo asked the posts agent, which opened ${tool} for you.`;
  }

  static async listen(
    port: number,
    webUrl: string,
    postsApp: PostsMcpApp,
  ): Promise<TheoStandIn> {
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
      postsApp,
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
    if (request.method === 'POST' && request.url === '/openings') {
      const { asked, opening } = JSON.parse(
        await TheoStandIn.bodyOf(request),
      ) as { asked: string; opening: PostsAppOpening };
      this.openings.set(asked, opening);
      response.writeHead(204).end();
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
    const input = JSON.parse(await TheoStandIn.bodyOf(request)) as RunInput;
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
      catalogs: TheoStandIn.catalogsDrawingAnAppIn(input.context),
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
    for (const event of await this.runOf(input, invocation, token)) {
      response.write(TheoStandIn.sse(event));
      await new Promise((resolve) =>
        setTimeout(resolve, TheoStandIn.STREAM_PACE_MS),
      );
    }
    response.end();
  }

  private async runOf(
    input: RunInput,
    invocation: TheoInvocation,
    token: string,
  ): Promise<AgUiEvent[]> {
    const opening = this.openings.get(invocation.asked);
    const [catalogId] = invocation.catalogs;
    if (!opening || !catalogId) {
      const said = TheoStandIn.delegateSays(String(invocation.claims.sub));
      return TheoStandIn.delegationOf(input, {
        task: `Tell me who is asking: ${invocation.asked}`,
        said,
        result: said,
        answer: TheoStandIn.answerTo(invocation.asked),
      });
    }
    try {
      const opened = await this.postsApp.open(opening, token);
      const said = TheoStandIn.delegateOpens(opening.tool);
      return TheoStandIn.delegationOf(input, {
        task: invocation.asked,
        said,
        result: JSON.stringify({
          a2ui_operations: TheoStandIn.surfaceOf(
            opened,
            catalogId,
            `call-${input.runId}`,
          ),
          answer: said,
        }),
        answer: TheoStandIn.answerOpening(opening.tool),
      });
    } catch (failure) {
      return [
        { type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId },
        {
          type: 'RUN_ERROR',
          message: `The posts app did not open: ${failure instanceof Error ? failure.message : String(failure)}`,
        },
      ];
    }
  }

  private static surfaceOf(
    opened: OpenedPostsApp,
    catalogId: string,
    call: string,
  ): Record<string, unknown>[] {
    const surfaceId = `mcp-app-${opened.toolName}-${call}`.replace(
      /[^A-Za-z0-9_-]/g,
      '-',
    );
    return [
      {
        version: TheoStandIn.A2UI_VERSION,
        createSurface: { surfaceId, catalogId },
      },
      {
        version: TheoStandIn.A2UI_VERSION,
        updateComponents: {
          surfaceId,
          components: [
            {
              id: 'root',
              component: TheoStandIn.MCP_APP_COMPONENT,
              server: PostsMcpApp.NAME,
              ...opened,
            },
          ],
        },
      },
    ];
  }

  private static catalogsDrawingAnAppIn(
    context: RunInput['context'],
  ): string[] {
    const ids = (context ?? []).flatMap(({ value }) => {
      try {
        const catalog = JSON.parse(String(value)) as {
          catalogId?: unknown;
          components?: Record<string, unknown>;
        } | null;
        return typeof catalog?.catalogId === 'string' &&
          catalog.components &&
          TheoStandIn.MCP_APP_COMPONENT in catalog.components
          ? [catalog.catalogId]
          : [];
      } catch {
        return [];
      }
    });
    return [...new Set(ids)];
  }

  private static delegationOf(
    { threadId, runId }: RunInput,
    turn: { task: string; said: string; result: string; answer: string },
  ): AgUiEvent[] {
    const call = `call-${runId}`;
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
          task: turn.task,
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
        delta: turn.said,
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
        result: turn.said,
        outcome: { type: 'success' },
      },
      {
        type: 'TOOL_CALL_RESULT',
        messageId: `${call}:result`,
        toolCallId: call,
        role: 'tool',
        content: turn.result,
      },
      {
        type: 'TEXT_MESSAGE_START',
        messageId: `answer-${runId}`,
        role: 'assistant',
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: `answer-${runId}`,
        delta: turn.answer,
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
