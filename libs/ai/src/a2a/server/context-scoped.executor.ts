import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
} from '@a2a-js/sdk/server';

import { AgentContexts } from '../../agents/context/agent-context';
import { AgentRunContext } from '../../agents/context/agent-run-context';

export class ContextScopedExecutor implements AgentExecutor {
  constructor(private readonly delegate: AgentExecutor) {}

  execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const user = context.context?.user;
    return AgentRunContext.within(
      AgentContexts.isAgentContext(user) ? user : undefined,
      () => this.delegate.execute(context, eventBus),
    );
  }

  cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    return this.delegate.cancelTask(taskId, eventBus);
  }
}
