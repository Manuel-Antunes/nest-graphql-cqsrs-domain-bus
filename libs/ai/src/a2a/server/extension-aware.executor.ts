import type {
  AgentExecutionEvent,
  AgentExecutor,
  EventListener,
  ExecutionEventBus,
  FinishedListener,
  RequestContext,
} from '@a2a-js/sdk/server';

import { AgentExtensions } from '../domain/agent-extensions';
import type { AnyExtension } from '../domain/extension';

export class ExtensionAwareAgentExecutor implements AgentExecutor {
  constructor(
    private readonly delegate: AgentExecutor,
    private readonly extensions = new AgentExtensions(),
  ) {}

  async execute(
    context: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    return this.delegate.execute(context, this.busFor(context, eventBus));
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    return this.delegate.cancelTask(taskId, eventBus);
  }

  private busFor(
    context: RequestContext,
    eventBus: ExecutionEventBus,
  ): ExecutionEventBus {
    if (!context.context) return eventBus;
    const active = this.extensions.activateForTurn(context.context);
    return active.length ? new DecoratingEventBus(eventBus, active) : eventBus;
  }
}

class DecoratingEventBus implements ExecutionEventBus {
  constructor(
    private readonly delegate: ExecutionEventBus,
    private readonly extensions: readonly AnyExtension[],
  ) {}

  publish(event: AgentExecutionEvent): void {
    for (const extension of this.extensions) extension.decorateEvent(event);
    this.delegate.publish(event);
  }

  finished(): void {
    this.delegate.finished();
  }

  on(eventName: 'event', listener: EventListener): this;
  on(eventName: 'finished', listener: FinishedListener): this;
  on(
    eventName: 'event' | 'finished',
    listener: EventListener | FinishedListener,
  ): this {
    if (eventName === 'event') {
      this.delegate.on('event', listener as EventListener);
    } else {
      this.delegate.on('finished', listener as FinishedListener);
    }
    return this;
  }

  off(eventName: 'event', listener: EventListener): this;
  off(eventName: 'finished', listener: FinishedListener): this;
  off(
    eventName: 'event' | 'finished',
    listener: EventListener | FinishedListener,
  ): this {
    if (eventName === 'event') {
      this.delegate.off('event', listener as EventListener);
    } else {
      this.delegate.off('finished', listener as FinishedListener);
    }
    return this;
  }

  once(eventName: 'event', listener: EventListener): this;
  once(eventName: 'finished', listener: FinishedListener): this;
  once(
    eventName: 'event' | 'finished',
    listener: EventListener | FinishedListener,
  ): this {
    if (eventName === 'event') {
      this.delegate.once('event', listener as EventListener);
    } else {
      this.delegate.once('finished', listener as FinishedListener);
    }
    return this;
  }

  removeAllListeners(eventName?: 'event' | 'finished'): this {
    this.delegate.removeAllListeners(eventName);
    return this;
  }
}
