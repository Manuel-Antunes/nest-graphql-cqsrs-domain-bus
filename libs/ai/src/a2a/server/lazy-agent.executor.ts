import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
} from '@a2a-js/sdk/server';

import { Lazy } from '../../agents/lazy';

export type A2aExecutorFactory = () => AgentExecutor | Promise<AgentExecutor>;

export class LazyAgentExecutor implements AgentExecutor {
  private readonly executor: Lazy<AgentExecutor>;

  constructor(factory: A2aExecutorFactory) {
    this.executor = new Lazy(factory);
  }

  static of(executor: AgentExecutor | A2aExecutorFactory): AgentExecutor {
    return typeof executor === 'function'
      ? new LazyAgentExecutor(executor)
      : executor;
  }

  static isExecutor(value: unknown): value is AgentExecutor {
    return (
      typeof value === 'function' ||
      typeof (value as AgentExecutor | undefined)?.execute === 'function'
    );
  }

  async execute(
    context: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    return (await this.executor.get()).execute(context, eventBus);
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    const built = this.executor.peek();
    if (!built) return;
    return (await built).cancelTask(taskId, eventBus);
  }
}
