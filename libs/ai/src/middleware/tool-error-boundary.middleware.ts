import { ToolMessage } from '@langchain/core/messages';
import { isGraphBubbleUp } from '@langchain/langgraph';
import type { Logger } from '@nestjs/common';
import { createMiddleware } from 'langchain';

/**
 * Per-tool-call error boundary.
 *
 * Without it, a single bad tool call aborts the ENTIRE agent run: e.g. a
 * small/local model emits `task({ subagent_type })` with no `description`, the
 * deepagents `task` tool rejects it (`ToolInputParsingException`), and the
 * exception propagates out of the graph — the turn dies with no recovery.
 *
 * This middleware catches any THROW from a tool invocation (input-schema
 * validation OR the tool body) and converts it into an `error` ToolMessage
 * bound to the same `tool_call_id`. The model then SEES the failure on its
 * next step and can correct the call (e.g. add the missing `description`) or
 * move on — and the turn still reaches the final delivery step instead of
 * dead-ending. The agent's recursion limit bounds any retry loop.
 *
 * CRITICAL: langgraph control-flow signals (`interrupt()` → `GraphInterrupt`,
 * `Command` routing → `ParentCommand`) ALSO propagate by throwing. Those are
 * NOT errors — they must bubble up untouched, or e.g. a `search-case-fallback`
 * interrupt raised inside a `task` subagent would be swallowed here (turning a
 * "consultando o processo…" pause into a fake tool error). `isGraphBubbleUp`
 * is the base-class guard for all such signals; we re-throw them.
 *
 * Add it FIRST in a middleware array so its `wrapToolCall` is the outermost
 * wrapper and therefore catches errors from every inner middleware + the tool.
 */
export const toolErrorBoundaryMiddleware = (logger: Logger) =>
  createMiddleware({
    name: 'ToolErrorBoundaryMiddleware',
    wrapToolCall: async (request, handler) => {
      try {
        return await handler(request);
      } catch (err) {
        if (isGraphBubbleUp(err)) throw err;
        const name = request.toolCall?.name ?? 'unknown';
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(
          `[tool-error-boundary] tool "${name}" threw — returning error ToolMessage so the turn can recover: ${message}`,
        );
        return new ToolMessage({
          tool_call_id: request.toolCall?.id ?? '',
          name,
          status: 'error',
          content: `Erro ao executar a ferramenta "${name}": ${message}. Corrija os argumentos (todos os campos obrigatorios) e tente de novo, ou prossiga sem essa ferramenta.`,
        });
      }
    },
  });
