import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
} from '@a2a-js/sdk/server';

export type A2aExecutorFactory = () => AgentExecutor | Promise<AgentExecutor>;

export class LazyAgentExecutor implements AgentExecutor {
  private built?: Promise<AgentExecutor>;

  constructor(private readonly factory: A2aExecutorFactory) {}

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
    return (await this.executor()).execute(context, eventBus);
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    if (!this.built) return;
    return (await this.built).cancelTask(taskId, eventBus);
  }

  private executor(): Promise<AgentExecutor> {
    this.built ??= Promise.resolve()
      .then(this.factory)
      .catch((error: unknown) => {
        this.built = undefined;
        throw error;
      });
    return this.built;
  }
}
