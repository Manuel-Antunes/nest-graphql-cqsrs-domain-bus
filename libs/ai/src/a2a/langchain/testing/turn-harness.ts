import { randomUUID } from 'node:crypto';
import {
  type Message,
  type Part,
  Role,
  type SendMessageRequest,
  TaskState,
} from '@a2a-js/sdk';
import {
  type AgentExecutionEvent,
  type ExecutionEventBus,
  RequestContext,
  ServerCallContext,
} from '@a2a-js/sdk/server';
import type { ReactAgent } from 'langchain';

import { AgentExtensions } from '../../domain/agent-extensions';
import type { ClientToolsExtensionPayload } from '../../domain/extensions/client-tools.extension';
import type { PlanUpdatePayload } from '../../domain/extensions/deep-agent.extension';
import type {
  HitlRequestPayload,
  HitlResponsePayload,
} from '../../domain/extensions/human-in-the-loop.extension';
import { ReactAgentExecutor } from '../react-agent.executor';

export type TurnPayload =
  | ClientToolsExtensionPayload
  | PlanUpdatePayload
  | HitlRequestPayload
  | HitlResponsePayload;

export class RecordingEventBus implements ExecutionEventBus {
  readonly events: AgentExecutionEvent[] = [];
  readonly publishedAfterTerminal: AgentExecutionEvent[] = [];
  onEvent?: (event: AgentExecutionEvent) => void;
  private terminal = false;

  publish(event: AgentExecutionEvent): void {
    if (this.terminal) this.publishedAfterTerminal.push(event);
    this.events.push(event);
    if (
      event.kind === 'statusUpdate' &&
      TurnHarness.isTerminal(event.data.status?.state)
    ) {
      this.terminal = true;
    }
    this.onEvent?.(event);
  }

  finished(): void {}

  on() {
    return this;
  }

  off() {
    return this;
  }

  once() {
    return this;
  }

  removeAllListeners() {
    return this;
  }
}

export interface TurnInput {
  agent: ReactAgent;
  contextId: string;
  taskId?: string;
  text?: string;
  parts?: Part[];
  metadata?: Record<string, unknown>;
  extensions?: string[];
  onStart?: (handle: {
    executor: ReactAgentExecutor<ReactAgent>;
    bus: RecordingEventBus;
    taskId: string;
  }) => void;
}

export interface TurnResult {
  bus: RecordingEventBus;
  taskId: string;
  payloads: TurnPayload[];
  artifactText: string;
  artifactClosed: boolean;
  finalState: TaskState | undefined;
  finalPayloads: TurnPayload[];
  timeline: string[];
}

export class TurnHarness {
  private static readonly extensions = new AgentExtensions();

  static async run(input: TurnInput): Promise<TurnResult> {
    const taskId = input.taskId ?? `task-${randomUUID()}`;
    const bus = new RecordingEventBus();

    const message: Message = {
      messageId: `msg-${randomUUID()}`,
      contextId: input.contextId,
      taskId: input.taskId ?? '',
      role: Role.ROLE_USER,
      parts: [
        ...(input.text
          ? [
              {
                content: { $case: 'text' as const, value: input.text },
                metadata: undefined,
                filename: '',
                mediaType: 'text/plain',
              },
            ]
          : []),
        ...(input.parts ?? []),
      ],
      metadata: input.metadata,
      extensions: [],
      referenceTaskIds: [],
    };
    const request: SendMessageRequest = {
      tenant: '',
      message,
      configuration: undefined,
      metadata: undefined,
    };

    const serverContext = new ServerCallContext({});
    for (const uri of input.extensions ?? []) {
      serverContext.addActivatedExtension(uri);
    }

    const executor = new ReactAgentExecutor(input.agent);
    input.onStart?.({ executor, bus, taskId });
    await executor.execute(
      new RequestContext(request, taskId, input.contextId, serverContext),
      bus,
    );

    return TurnHarness.summarise(bus, taskId);
  }

  static isTerminal(state: TaskState | undefined): boolean {
    return (
      state === TaskState.TASK_STATE_COMPLETED ||
      state === TaskState.TASK_STATE_INPUT_REQUIRED ||
      state === TaskState.TASK_STATE_FAILED ||
      state === TaskState.TASK_STATE_CANCELED
    );
  }

  static decode(part: Part): TurnPayload | undefined {
    const { clientTools, deepAgent, humanInTheLoop } = TurnHarness.extensions;
    return (
      clientTools.decode(part) ??
      deepAgent.decode(part) ??
      humanInTheLoop.decode(part)
    );
  }

  private static summarise(bus: RecordingEventBus, taskId: string): TurnResult {
    const payloads: TurnPayload[] = [];
    const timeline: string[] = [];
    let artifactText = '';
    let artifactClosed = false;
    let finalState: TaskState | undefined;
    let finalPayloads: TurnPayload[] = [];

    for (const event of bus.events) {
      if (event.kind === 'artifactUpdate') {
        const chunk = (event.data.artifact?.parts ?? [])
          .map((part) =>
            part.content?.$case === 'text' ? part.content.value : '',
          )
          .join('');
        artifactText += chunk;
        if (chunk) timeline.push(`text:${chunk}`);
        if (event.data.lastChunk) {
          artifactClosed = true;
          timeline.push('artifact-closed');
        }
        continue;
      }

      if (event.kind !== 'statusUpdate') continue;
      const decoded = (event.data.status?.message?.parts ?? [])
        .map((part) => TurnHarness.decode(part))
        .filter((payload): payload is TurnPayload => !!payload);

      if (TurnHarness.isTerminal(event.data.status?.state)) {
        finalState = event.data.status?.state;
        finalPayloads = decoded;
        payloads.push(...decoded);
        timeline.push(
          `final:${TaskState[event.data.status?.state as TaskState]}`,
        );
        continue;
      }

      for (const payload of decoded) {
        if (payload.type === 'tool-call') {
          timeline.push(`call:${payload.toolName}:${payload.execution}`);
        } else if (payload.type === 'tool-result') {
          timeline.push(`result:${payload.toolName}`);
        } else {
          timeline.push(payload.type);
        }
      }
      payloads.push(...decoded);
    }

    return {
      bus,
      taskId,
      payloads,
      artifactText,
      artifactClosed,
      finalState,
      finalPayloads,
      timeline,
    };
  }
}
