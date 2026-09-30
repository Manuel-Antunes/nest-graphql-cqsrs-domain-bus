import { type AnyAgentMiddleware, createMiddleware } from 'langchain';

import type { PromptService } from '../services/prompt.service';

/**
 * Per-turn system-prompt override sourced from Langfuse with a hardcoded
 * fallback. Built as middleware (not a constructor arg) so the agent
 * graph is compiled exactly once but the prompt can hot-reload through
 * the Langfuse cache TTL — no redeploy needed to iterate on copy.
 *
 * The base agent already has a `systemPrompt` set at construction time
 * (the hardcoded constant). This middleware intercepts every model call
 * and, when the Langfuse fetch returns a different string, swaps it in
 * before the model sees the request. On Langfuse outages the fetch
 * service falls back to the same constant the agent was built with —
 * the agent keeps working without observable change.
 */
export function systemPromptMiddleware(options: {
  /** Unique name to make the middleware identifiable in traces. */
  name: string;
  /** Langfuse prompt name (e.g. `natasha/system`). */
  promptName: string;
  /** Hardcoded fallback — returned on any Langfuse failure. */
  fallback: string;
  /** Injected prompt service. */
  promptService: PromptService;
}): AnyAgentMiddleware {
  const { name, promptName, fallback, promptService } = options;
  return createMiddleware({
    name,
    wrapModelCall: async (request, handler) => {
      const text = await promptService.getText(promptName, fallback);
      return handler({ ...request, systemPrompt: text });
    },
  });
}
