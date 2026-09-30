import { type Message, Role } from '@a2a-js/sdk';
import {
  type AgentExecutionEvent,
  type ExecutionEventBus,
  type RequestContext,
  ServerCallContext,
} from '@a2a-js/sdk/server';

export type RecordingBus = ExecutionEventBus & {
  events: AgentExecutionEvent[];
};

export class A2aWire {
  static keyPathsOf(value: unknown, key: string, path = '$'): string[] {
    const serialized = path === '$' ? JSON.parse(JSON.stringify(value)) : value;
    if (Array.isArray(serialized)) {
      return serialized.flatMap((item, index) =>
        A2aWire.keyPathsOf(item, key, `${path}[${index}]`),
      );
    }
    if (serialized && typeof serialized === 'object') {
      return Object.entries(serialized as Record<string, unknown>).flatMap(
        ([name, child]) =>
          name === key
            ? [`${path}.${name}`]
            : A2aWire.keyPathsOf(child, key, `${path}.${name}`),
      );
    }
    return [];
  }

  static message(
    parts: Message['parts'] = [],
    overrides: Partial<Message> = {},
  ): Message {
    return {
      messageId: 'm1',
      contextId: 'c1',
      taskId: 't1',
      role: Role.ROLE_AGENT,
      parts,
      metadata: undefined,
      extensions: [],
      referenceTaskIds: [],
      ...overrides,
    };
  }

  static serverContext(requested: string[] = []): ServerCallContext {
    return new ServerCallContext({ requestedExtensions: requested });
  }

  static activated(activated: string[]): ServerCallContext {
    const context = A2aWire.serverContext(activated);
    for (const uri of activated) context.addActivatedExtension(uri);
    return context;
  }

  static requestContext(
    context: ServerCallContext,
    turn: { userMessage?: Message; task?: RequestContext['task'] } = {},
  ): RequestContext {
    return {
      context,
      userMessage: turn.userMessage ?? A2aWire.message(),
      task: turn.task,
    } as unknown as RequestContext;
  }

  static recordingBus(): RecordingBus {
    const events: AgentExecutionEvent[] = [];
    const bus = {
      events,
      publish: (event: AgentExecutionEvent) => void events.push(event),
      finished: () => undefined,
      on: () => bus,
      off: () => bus,
      once: () => bus,
      removeAllListeners: () => bus,
    } as unknown as RecordingBus;
    return bus;
  }
}
