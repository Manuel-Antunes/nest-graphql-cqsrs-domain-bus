import { randomUUID } from 'node:crypto';
import {
  type Message,
  Role,
  type StreamResponse,
  TaskState,
} from '@a2a-js/sdk';
import { withA2AExtensions } from '@a2a-js/sdk/client';
import { type BaseEvent, EventType } from '@ag-ui/core';

import { A2aPart } from '../domain/a2a-part';
import {
  type A2uiClientCapabilities,
  A2uiExtension,
} from '../domain/extensions/a2ui.extension';
import { A2uiCapabilities } from './a2ui-capabilities';
import type { RemoteA2aAgent } from './remote-a2a-agents';

export interface A2aDelegationOptions {
  readonly toolCallId: string;
  readonly contextId?: string;
  readonly a2ui?: A2uiClientCapabilities;
  readonly signal?: AbortSignal;
  readonly emit: (event: BaseEvent) => void;
}

export class A2aDelegation {
  static readonly SESSION_HEADER =
    'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id';
  private static readonly SESSION_MIN_LENGTH = 33;
  private static readonly A2UI = new A2uiExtension();

  private readonly surfaces = new Map<string, unknown>();
  private answerId?: string;
  private streamed = '';
  private finalText = '';
  private state: TaskState = TaskState.TASK_STATE_UNSPECIFIED;

  constructor(
    private readonly agent: RemoteA2aAgent,
    private readonly options: A2aDelegationOptions,
  ) {}

  private get subagentRunId(): string {
    return this.options.toolCallId;
  }

  private get a2ui(): A2uiClientCapabilities | undefined {
    return this.options.a2ui;
  }

  async send(task: string): Promise<string> {
    this.emit({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: this.subagentRunId,
      name: this.agent.name,
      description: this.agent.description,
      parentToolCallId: this.options.toolCallId,
    });
    try {
      const stream = this.agent.client.sendMessageStream(
        {
          tenant: '',
          message: this.messageOf(task),
          configuration: undefined,
          metadata: undefined,
        },
        {
          signal: this.options.signal,
          serviceParameters: this.serviceParameters(),
        },
      );
      for await (const response of stream) this.onResponse(response);
      const answer = this.finalText || this.streamed;
      if (!this.streamed && answer) this.say(answer);
      this.closeAnswer();
      this.emit({
        type: EventType.SUBAGENT_FINISHED,
        subagentRunId: this.subagentRunId,
        result: answer,
        outcome: { type: 'success' },
      });
      return A2uiCapabilities.report(this.reportOf(answer), [
        ...this.surfaces.values(),
      ]);
    } catch (error) {
      this.closeAnswer();
      const message = error instanceof Error ? error.message : String(error);
      this.emit({
        type: EventType.SUBAGENT_ERROR,
        subagentRunId: this.subagentRunId,
        message,
      });
      if ((error as Error | undefined)?.name === 'AbortError') throw error;
      return `${this.agent.name} could not be reached: ${message}`;
    }
  }

  private onResponse({ payload }: StreamResponse): void {
    switch (payload?.$case) {
      case 'artifactUpdate':
        this.say(A2aPart.textOf(payload.value.artifact?.parts ?? []));
        return;
      case 'statusUpdate':
        this.settle(payload.value.status?.state, payload.value.status?.message);
        return;
      case 'task':
        this.settle(payload.value.status?.state, payload.value.status?.message);
        return;
      case 'message':
        this.finalText = A2aPart.textOf(payload.value.parts);
        this.collect(payload.value.parts);
        this.state = TaskState.TASK_STATE_COMPLETED;
        return;
      default:
        return;
    }
  }

  private settle(state: TaskState | undefined, message: Message | undefined) {
    if (state !== undefined) this.state = state;
    const text = message ? A2aPart.textOf(message.parts) : '';
    if (text && A2aDelegation.isFinal(this.state)) this.finalText = text;
    if (message) this.collect(message.parts);
  }

  private collect(parts: Message['parts']): void {
    if (!this.a2ui) return;
    for (const surface of A2aDelegation.A2UI.messagesIn(parts)) {
      this.surfaces.set(JSON.stringify(surface), surface);
    }
  }

  private say(delta: string): void {
    if (!delta) return;
    if (!this.answerId) {
      this.answerId = `${this.subagentRunId}:answer`;
      this.emit({
        type: EventType.TEXT_MESSAGE_START,
        messageId: this.answerId,
        role: 'assistant',
        subagentRunId: this.subagentRunId,
      });
    }
    this.streamed += delta;
    this.emit({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: this.answerId,
      delta,
      subagentRunId: this.subagentRunId,
    });
  }

  private closeAnswer(): void {
    if (!this.answerId) return;
    this.emit({
      type: EventType.TEXT_MESSAGE_END,
      messageId: this.answerId,
      subagentRunId: this.subagentRunId,
    });
    this.answerId = undefined;
  }

  private reportOf(answer: string): string {
    const said = answer || '(no answer)';
    switch (this.state) {
      case TaskState.TASK_STATE_INPUT_REQUIRED:
        return `${this.agent.name} needs an answer from the user before it can go on:\n${said}`;
      case TaskState.TASK_STATE_AUTH_REQUIRED:
        return `${this.agent.name} refused: the user's credential is not enough for this.\n${said}`;
      case TaskState.TASK_STATE_FAILED:
      case TaskState.TASK_STATE_REJECTED:
      case TaskState.TASK_STATE_CANCELED:
        return `${this.agent.name} did not complete the task:\n${said}`;
      default:
        return said;
    }
  }

  private messageOf(task: string): Message {
    const message: Message = {
      messageId: randomUUID(),
      contextId: this.contextId() ?? '',
      taskId: '',
      role: Role.ROLE_USER,
      parts: [A2aPart.text(task)],
      metadata: undefined,
      extensions: [],
      referenceTaskIds: [],
    };
    return this.a2ui
      ? A2aDelegation.A2UI.withClientCapabilities(message, this.a2ui)
      : message;
  }

  private serviceParameters(): Record<string, string> {
    const parameters = this.sessionHeaders();
    if (this.a2ui) withA2AExtensions(A2aDelegation.A2UI.uri)(parameters);
    return parameters;
  }

  private sessionHeaders(): Record<string, string> {
    const session = this.contextId();
    return session && session.length >= A2aDelegation.SESSION_MIN_LENGTH
      ? { [A2aDelegation.SESSION_HEADER]: session }
      : {};
  }

  private contextId(): string | undefined {
    return this.options.contextId || undefined;
  }

  private emit(event: BaseEvent): void {
    this.options.emit(event);
  }

  private static isFinal(state: TaskState): boolean {
    return (
      state === TaskState.TASK_STATE_COMPLETED ||
      state === TaskState.TASK_STATE_INPUT_REQUIRED ||
      state === TaskState.TASK_STATE_AUTH_REQUIRED ||
      state === TaskState.TASK_STATE_FAILED ||
      state === TaskState.TASK_STATE_REJECTED ||
      state === TaskState.TASK_STATE_CANCELED
    );
  }
}
