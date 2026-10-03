import { AsyncLocalStorage } from 'node:async_hooks';

import type { AgentContext } from './agent-context';

export class AgentRunContext {
  static readonly KEY = 'agent';

  private static readonly storage = new AsyncLocalStorage<
    AgentContext | undefined
  >();

  static within<T>(context: AgentContext | undefined, work: () => T): T {
    return AgentRunContext.storage.run(context, work);
  }

  static current(): AgentContext | undefined {
    return AgentRunContext.storage.getStore();
  }

  static of(
    runtime: { context?: unknown } | undefined,
  ): AgentContext | undefined {
    const context = runtime?.context as Record<string, unknown> | undefined;
    return (
      (context?.[AgentRunContext.KEY] as AgentContext | undefined) ?? undefined
    );
  }

  static bearerFetch(base: typeof fetch = fetch): typeof fetch {
    return (input, init) => {
      const credential = AgentRunContext.current()?.credential;
      if (!credential) return base(input, init);
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${credential}`);
      return base(input, { ...init, headers });
    };
  }
}
