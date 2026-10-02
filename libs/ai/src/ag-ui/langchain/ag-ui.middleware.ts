import type { Context, Tool } from '@ag-ui/core';
import { AIMessage, ToolMessage } from '@langchain/core/messages';
import { type AnyAgentMiddleware, createMiddleware, tool } from 'langchain';
import z, { fromJSONSchema } from 'zod';

import { SystemGuidance } from '../../middleware/system-guidance';

export interface AgUiRuntimeContext {
  readonly tools?: readonly Tool[];
  readonly context?: readonly Context[];
  readonly instructions?: readonly string[];
  readonly frontendToolNames?: Set<string>;
}

export class AgUiMiddleware {
  static readonly CLIENT_EXECUTED =
    "This tool runs in the user's application, not here: the run ends at its call and the application answers it.";

  static readonly CONTEXT_SCHEMA = z.object({
    agUi: z.custom<AgUiRuntimeContext>().optional(),
  });

  static create(): AnyAgentMiddleware {
    return createMiddleware({
      name: 'AgUiMiddleware',
      contextSchema: AgUiMiddleware.CONTEXT_SCHEMA,
      wrapModelCall: async (request, handler) => {
        const context = AgUiMiddleware.contextOf(request.runtime.context);
        const serverToolNames = new Set(request.tools.map((t) => t.name));
        const frontendTools = (context.tools ?? [])
          .filter((declared) => !serverToolNames.has(declared.name))
          .map(AgUiMiddleware.frontendTool);
        for (const frontendTool of frontendTools) {
          context.frontendToolNames?.add(frontendTool.name);
        }
        return handler({
          ...request,
          tools: [...request.tools, ...frontendTools],
          systemMessage: SystemGuidance.append(
            request,
            ...(context.instructions ?? []),
            AgUiMiddleware.render(context.context),
          ),
        });
      },
      wrapToolCall: async (request, handler) => {
        const names = AgUiMiddleware.contextOf(
          request.runtime.context,
        ).frontendToolNames;
        if (!names?.has(request.toolCall.name)) return handler(request);
        return new ToolMessage({
          name: request.toolCall.name,
          tool_call_id: request.toolCall.id as string,
          content: AgUiMiddleware.CLIENT_EXECUTED,
          status: 'error',
        });
      },
      afterModel: {
        canJumpTo: ['end'],
        hook: (state, runtime) => {
          const names = AgUiMiddleware.contextOf(
            runtime.context,
          ).frontendToolNames;
          const last = state.messages.at(-1);
          const handsOver =
            names !== undefined &&
            names.size > 0 &&
            AIMessage.isInstance(last) &&
            (last.tool_calls ?? []).some((call) => names.has(call.name));
          return handsOver ? { jumpTo: 'end' as const } : undefined;
        },
      },
    });
  }

  static render(context: readonly Context[] | undefined): string | undefined {
    if (!context?.length) return undefined;
    return [
      '## Context from the application',
      ...context.map((entry) => `${entry.description}:\n${entry.value}`),
    ].join('\n\n');
  }

  private static contextOf(context: unknown): AgUiRuntimeContext {
    return (context as { agUi?: AgUiRuntimeContext } | undefined)?.agUi ?? {};
  }

  private static frontendTool(declared: Tool) {
    return tool(async () => undefined, {
      name: declared.name,
      description: declared.description,
      schema: fromJSONSchema(
        (declared.parameters ?? {
          type: 'object',
          properties: {},
        }) as Parameters<typeof fromJSONSchema>[0],
      ),
    });
  }
}
