import type { BaseEvent } from '@ag-ui/core';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';

export class AgUiEvents {
  static readonly CHANNEL = 'ag-ui';

  static emit(
    config: Pick<LangGraphRunnableConfig, 'writer'> | undefined,
    ...events: BaseEvent[]
  ): void {
    for (const event of events) {
      config?.writer?.({ [AgUiEvents.CHANNEL]: event });
    }
  }

  static of(payload: unknown): BaseEvent | undefined {
    if (!payload || typeof payload !== 'object') return undefined;
    const event = (payload as Record<string, unknown>)[AgUiEvents.CHANNEL];
    return event &&
      typeof event === 'object' &&
      typeof (event as BaseEvent).type === 'string'
      ? (event as BaseEvent)
      : undefined;
  }
}
