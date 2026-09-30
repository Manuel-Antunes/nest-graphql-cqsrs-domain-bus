import { interrupt, isGraphBubbleUp } from '@langchain/langgraph';
import {
  type AnyAgentMiddleware,
  createMiddleware,
  ToolMessage,
  tool,
} from 'langchain';
import z, { fromJSONSchema } from 'zod';

import { SystemGuidance } from '../../middleware/system-guidance';
import { AgentExtensions } from '../domain/agent-extensions';
import type { BrowserContextPayload } from '../domain/extensions/browser-context.extension';
import {
  type ClientToolDeclaration,
  ClientToolsExtension,
} from '../domain/extensions/client-tools.extension';

export type A2aRuntimeContext = {
  clientTools?: Omit<ClientToolDeclaration, 'review'>[];
  clientInstructions?: string;
  browserContext?: BrowserContextPayload;
  activatedExtensions?: string[];
  clientToolNames?: Set<string>;
};

type RewritableToolCall = {
  readonly type?: 'tool_call';
  id?: string;
  name: string;
  args: Record<string, unknown>;
};

export class A2aMiddleware {
  static readonly CONTEXT_SCHEMA = z.object({
    a2a: z.object({
      clientTools: z
        .array(
          z.object({
            name: z.string(),
            description: z.string().optional(),
            parameters: z.record(z.string(), z.unknown()).optional(),
          }),
        )
        .optional(),
      clientInstructions: z.string().optional(),
      browserContext: z.custom<BrowserContextPayload>().optional(),
      activatedExtensions: z.array(z.string()).optional(),
      clientToolNames: z.custom<Set<string>>().optional(),
    }),
  });

  constructor(private readonly extensions = new AgentExtensions()) {}

  static create(extensions = new AgentExtensions()): AnyAgentMiddleware {
    return new A2aMiddleware(extensions).build();
  }

  build(): AnyAgentMiddleware {
    return createMiddleware({
      name: 'A2aMiddleware',
      contextSchema: A2aMiddleware.CONTEXT_SCHEMA,
      tools: [A2aMiddleware.envelopeTool()],
      wrapModelCall: async (request, handler) => {
        const context = request.runtime.context.a2a as A2aRuntimeContext;
        const { clientTools, browserContext } = this.extensions;
        const clientToolsActive = clientTools.isActivatedIn(
          context.activatedExtensions,
        );

        const declared = clientToolsActive ? (context.clientTools ?? []) : [];
        const serverToolNames = new Set(request.tools.map((t) => t.name));
        const pageTools = declared
          .filter((declaration) => !serverToolNames.has(declaration.name))
          .map((declaration) => A2aMiddleware.pageTool(declaration));
        const tools = [...request.tools, ...pageTools].filter(
          (t) =>
            declared.length > 0 ||
            t.name !== ClientToolsExtension.ENVELOPE_TOOL,
        );
        for (const pageTool of pageTools) {
          context.clientToolNames?.add(pageTool.name);
        }

        const response = await handler({
          ...request,
          tools,
          systemMessage: SystemGuidance.append(
            request,
            context.clientInstructions,
            clientToolsActive && clientTools.promptFor(pageTools),
            browserContext.isActivatedIn(context.activatedExtensions) &&
              browserContext.render(context.browserContext),
          ),
        });

        const pageToolNames = new Set(pageTools.map((t) => t.name));
        const rewrite = (call: RewritableToolCall) =>
          A2aMiddleware.envelope(call, pageToolNames);
        response.tool_calls = response.tool_calls?.map(rewrite);
        A2aMiddleware.rewriteToolCallBlocks(response, rewrite);
        return response;
      },
      wrapToolCall: async (request, handler) => {
        try {
          return await handler(request);
        } catch (error) {
          if (isGraphBubbleUp(error)) throw error;
          if (error instanceof Error && error.name === 'AbortError')
            throw error;
          return new ToolMessage({
            name: request.toolCall.name,
            tool_call_id: request.toolCall.id as string,
            content: error instanceof Error ? error.message : String(error),
            status: 'error',
          });
        }
      },
    });
  }

  private static envelopeTool() {
    return tool(async (toolCall) => interrupt({ clientTool: toolCall }), {
      name: ClientToolsExtension.ENVELOPE_TOOL,
      description: 'intercept a llm client tool call',
      schema: z.record(z.string(), z.unknown()),
    });
  }

  private static pageTool(declaration: Omit<ClientToolDeclaration, 'review'>) {
    return tool(async () => undefined, {
      name: declaration.name,
      description: declaration.description,
      schema: fromJSONSchema(
        (declaration.parameters ?? {
          type: 'object',
          properties: {},
        }) as Parameters<typeof fromJSONSchema>[0],
      ),
    });
  }

  private static envelope(
    call: RewritableToolCall,
    pageToolNames: ReadonlySet<string>,
  ): RewritableToolCall {
    if (pageToolNames.has(call.name)) {
      return {
        name: ClientToolsExtension.ENVELOPE_TOOL,
        args: {
          id: call.id,
          name: call.name,
          args: call.args,
          type: call.type,
        },
        id: call.id,
        type: call.type,
      };
    }

    if (call.name === ClientToolsExtension.ENVELOPE_TOOL) {
      const innerId = (call.args as { id?: unknown } | undefined)?.id;
      if (typeof innerId === 'string' && innerId && innerId !== call.id) {
        return { ...call, id: innerId };
      }
    }

    return call;
  }

  private static rewriteToolCallBlocks(
    message: { content?: unknown },
    rewrite: (call: RewritableToolCall) => RewritableToolCall,
  ): void {
    if (!Array.isArray(message.content)) return;
    message.content = message.content.map((block) => {
      const candidate = block as RewritableToolCall | undefined;
      if (
        candidate?.type !== 'tool_call' ||
        typeof candidate.name !== 'string'
      ) {
        return block;
      }
      const rewritten = rewrite(candidate);
      if (rewritten === candidate) return block;
      return {
        type: 'tool_call',
        id: rewritten.id,
        name: rewritten.name,
        args: rewritten.args,
      };
    });
  }
}
