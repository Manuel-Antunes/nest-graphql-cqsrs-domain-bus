import { ApolloLink } from '@apollo/client';
import type { ApplicationManifest } from '@apollo/client-ai-apps';
import { from, type Observable } from 'rxjs';

interface ToolCaller {
  callServerTool(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<ToolCallOutcome>;
}

interface ToolCallOutcome {
  isError?: boolean;
  content?: readonly { type: string; text?: string }[];
  structuredContent?: { result?: ApolloLink.Result };
  _meta?: { structuredContent?: { result?: ApolloLink.Result } };
  error?: unknown;
}

export class ServerToolError extends Error {
  override readonly name = 'ServerToolError';
}

export class ServerToolLink extends ApolloLink {
  private readonly tools: ReadonlyMap<string, string>;

  constructor(manifest: Pick<ApplicationManifest, 'operations'>) {
    super();
    this.tools = new Map(
      manifest.operations
        .filter((operation) => operation.type === 'mutation')
        .flatMap((operation) =>
          operation.tools
            .slice(0, 1)
            .map((tool) => [operation.name, tool.name]),
        ),
    );
  }

  override request(
    operation: ApolloLink.Operation,
    forward: ApolloLink.ForwardFunction,
  ): Observable<ApolloLink.Result> {
    const tool = operation.operationName
      ? this.tools.get(operation.operationName)
      : undefined;
    if (!tool) return forward(operation);
    return from(
      ServerToolLink.call(
        ServerToolLink.callerOf(operation.client),
        tool,
        operation.variables,
      ),
    );
  }

  static async call(
    caller: ToolCaller,
    tool: string,
    variables: Record<string, unknown> | undefined,
  ): Promise<ApolloLink.Result> {
    const outcome = await caller.callServerTool({
      name: tool,
      arguments: variables ?? {},
    });
    const result =
      outcome._meta?.structuredContent?.result ??
      outcome.structuredContent?.result;
    if (result) return result;
    throw new ServerToolError(ServerToolLink.failureOf(tool, outcome));
  }

  private static failureOf(tool: string, outcome: ToolCallOutcome): string {
    const said = (outcome.content ?? [])
      .map((block) => (block.type === 'text' ? (block.text ?? '') : ''))
      .join('\n')
      .trim();
    if (said) return said;
    if (typeof outcome.error === 'string') return outcome.error;
    return `${tool} did not answer.`;
  }

  private static callerOf(client: unknown): ToolCaller {
    const app = (client as { appManager?: { app?: ToolCaller } }).appManager
      ?.app;
    if (!app) {
      throw new ServerToolError(
        'This client is not connected to an MCP host, so it cannot call a tool.',
      );
    }
    return app;
  }
}
