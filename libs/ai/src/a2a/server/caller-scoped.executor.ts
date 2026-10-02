import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
} from '@a2a-js/sdk/server';

import type { AgentCallers } from '../../agents/callers/agent-callers';

export class CallerScopedExecutor implements AgentExecutor {
  constructor(
    private readonly callers: AgentCallers,
    private readonly delegate: AgentExecutor,
  ) {}

  execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    return this.callers.run(context.context?.user, () =>
      this.delegate.execute(context, eventBus),
    );
  }

  cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    return this.delegate.cancelTask(taskId, eventBus);
  }
}
