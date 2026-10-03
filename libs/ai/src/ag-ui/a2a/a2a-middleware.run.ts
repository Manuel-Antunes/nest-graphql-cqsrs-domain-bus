import { randomUUID } from 'node:crypto';
import type { AbstractAgent } from '@ag-ui/client';
import {
  type BaseEvent,
  EventType,
  type Message,
  type MessagesSnapshotEvent,
  type RunAgentInput,
  type RunErrorEvent,
  type TextMessageContentEvent,
  type TextMessageStartEvent,
  type Tool,
  type ToolCallArgsEvent,
  type ToolCallResultEvent,
  type ToolCallStartEvent,
  type ToolMessage,
} from '@ag-ui/core';
import { propagateAttributes, startActiveObservation } from '@langfuse/tracing';

import { A2aDelegation } from '../../a2a/client/a2a-delegation';
import { A2uiCapabilities } from '../../a2a/client/a2ui-capabilities';
import type { RemoteA2aAgents } from '../../a2a/client/remote-a2a-agents';
import { AgentRunContext } from '../../agents/context/agent-run-context';
import { DelegatedMessages } from './delegated-messages';

export interface A2aMiddlewareRunConfig {
  readonly orchestrator: AbstractAgent;
  readonly agents: Pick<RemoteA2aAgents, 'names' | 'reach'>;
  readonly delegationTool: Tool | undefined;
  readonly traceName: string;
  readonly maxRounds: number;
}

interface DelegationCall {
  readonly toolCallId: string;
  readonly arguments: string;
}

interface Round {
  readonly snapshot: Message[] | undefined;
  readonly delegations: DelegationCall[];
}

export class A2aMiddlewareRun {
  private static readonly WITHHELD: ReadonlySet<string> = new Set([
    EventType.RUN_STARTED,
    EventType.RUN_FINISHED,
    EventType.RUN_ERROR,
    EventType.RAW,
    EventType.STATE_SNAPSHOT,
    EventType.STATE_DELTA,
    EventType.MESSAGES_SNAPSHOT,
  ]);

  private readonly abortController = new AbortController();
  private readonly delegated: Message[];
  private orchestrator?: AbstractAgent;

  constructor(
    private readonly config: A2aMiddlewareRunConfig,
    private readonly input: RunAgentInput,
    private readonly emit: (event: BaseEvent) => void,
  ) {
    this.delegated = DelegatedMessages.delegatedIn(input.messages);
  }

  abort(): void {
    this.abortController.abort();
    this.orchestrator?.abortRun();
  }

  traced(): Promise<void> {
    const caller = AgentRunContext.current();
    const { traceName } = this.config;
    return propagateAttributes(
      {
        traceName,
        sessionId: this.input.threadId,
        userId: caller?.isAuthenticated ? caller.userName : undefined,
        tags: [traceName],
      },
      () => startActiveObservation(traceName, () => this.drive()),
    );
  }

  private async drive(): Promise<void> {
    const { threadId, runId } = this.input;
    this.emit({ type: EventType.RUN_STARTED, threadId, runId });
    try {
      let messages = DelegatedMessages.forOrchestrator(this.input.messages);
      let snapshot: Message[] | undefined;
      for (let round = 1; ; round++) {
        if (round > this.config.maxRounds) {
          throw new Error(
            `The agent delegated ${this.config.maxRounds} times in a row without answering.`,
          );
        }
        const outcome = await this.round(messages);
        if (this.aborted) return;
        snapshot = outcome.snapshot ?? snapshot;
        if (outcome.delegations.length === 0) break;
        const results = await Promise.all(
          outcome.delegations.map((call) => this.delegate(call)),
        );
        if (this.aborted) return;
        messages = [...(outcome.snapshot ?? messages), ...results];
      }
      if (snapshot) {
        this.emit({
          type: EventType.MESSAGES_SNAPSHOT,
          messages: DelegatedMessages.withDelegated(snapshot, this.delegated),
        } satisfies MessagesSnapshotEvent);
      }
      this.emit({ type: EventType.RUN_FINISHED, threadId, runId });
    } catch (error) {
      if (this.aborted) return;
      this.emit({
        type: EventType.RUN_ERROR,
        message: error instanceof Error ? error.message : String(error),
      } satisfies RunErrorEvent);
    }
  }

  private round(messages: Message[]): Promise<Round> {
    const orchestrator = this.config.orchestrator.clone();
    this.orchestrator = orchestrator;
    const started = new Map<string, string>();
    const answered = new Set<string>();
    let snapshot: Message[] | undefined;
    return new Promise<Round>((resolve, reject) => {
      const finish = () =>
        resolve({
          snapshot,
          delegations: [...started]
            .filter(([toolCallId]) => !answered.has(toolCallId))
            .map(([toolCallId, streamed]) => ({
              toolCallId,
              arguments:
                A2aMiddlewareRun.argumentsOf(snapshot, toolCallId) ?? streamed,
            })),
        });
      const onAbort = () => {
        subscription.unsubscribe();
        finish();
      };
      const subscription = orchestrator
        .run({ ...this.input, messages, tools: this.tools() })
        .subscribe({
          next: (event: BaseEvent) => {
            switch (event.type) {
              case EventType.RUN_ERROR:
                reject(new Error((event as RunErrorEvent).message));
                return;
              case EventType.MESSAGES_SNAPSHOT:
                snapshot = (event as MessagesSnapshotEvent).messages;
                return;
              case EventType.TOOL_CALL_START: {
                const start = event as ToolCallStartEvent;
                if (start.toolCallName === this.config.delegationTool?.name) {
                  started.set(start.toolCallId, '');
                }
                break;
              }
              case EventType.TOOL_CALL_ARGS: {
                const args = event as ToolCallArgsEvent;
                const streamed = started.get(args.toolCallId);
                if (streamed !== undefined) {
                  started.set(args.toolCallId, streamed + args.delta);
                }
                break;
              }
              case EventType.TOOL_CALL_RESULT:
                answered.add((event as ToolCallResultEvent).toolCallId);
                break;
              default:
                break;
            }
            if (A2aMiddlewareRun.WITHHELD.has(event.type)) return;
            const { rawEvent: _raw, ...forwarded } = event;
            this.emit(forwarded);
          },
          error: (error: unknown) => {
            this.abortController.signal.removeEventListener('abort', onAbort);
            reject(error);
          },
          complete: () => {
            this.abortController.signal.removeEventListener('abort', onAbort);
            finish();
          },
        });
      this.abortController.signal.addEventListener('abort', onAbort, {
        once: true,
      });
    });
  }

  private async delegate(call: DelegationCall): Promise<ToolMessage> {
    const content = await this.delegationResult(call);
    const message: ToolMessage = {
      id: randomUUID(),
      role: 'tool',
      toolCallId: call.toolCallId,
      content,
    };
    this.emit({
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: call.toolCallId,
      messageId: message.id,
      content,
      role: 'tool',
    } satisfies ToolCallResultEvent);
    return message;
  }

  private async delegationResult(call: DelegationCall): Promise<string> {
    let agentName: string;
    let task: string;
    try {
      ({ agentName, task } = A2aMiddlewareRun.delegationOf(call.arguments));
    } catch (error) {
      return `The call could not be sent: ${(error as Error).message}`;
    }
    try {
      const agent = await this.config.agents.reach(agentName);
      return await new A2aDelegation(agent, {
        toolCallId: call.toolCallId,
        contextId: this.input.threadId,
        a2ui: A2uiCapabilities.of(this.input.context),
        signal: this.abortController.signal,
        emit: (event) => this.relay(event),
      }).send(task);
    } catch (error) {
      if (this.aborted) throw error;
      return (error as Error).message;
    }
  }

  private relay(event: BaseEvent): void {
    if (event.type === EventType.TEXT_MESSAGE_START) {
      const start = event as TextMessageStartEvent;
      this.delegated.push({
        id: start.messageId,
        role: 'assistant',
        content: '',
        ...(start.subagentRunId ? { subagentRunId: start.subagentRunId } : {}),
      });
    } else if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
      const content = event as TextMessageContentEvent;
      const message = this.delegated.find(
        (candidate) => candidate.id === content.messageId,
      );
      if (message?.role === 'assistant') {
        message.content = `${message.content ?? ''}${content.delta}`;
      }
    }
    this.emit(event);
  }

  private tools(): Tool[] {
    const declared = (this.input.tools ?? []).filter(
      (tool) => tool.name !== this.config.delegationTool?.name,
    );
    return this.config.delegationTool
      ? [...declared, this.config.delegationTool]
      : declared;
  }

  private get aborted(): boolean {
    return this.abortController.signal.aborted;
  }

  private static argumentsOf(
    snapshot: readonly Message[] | undefined,
    toolCallId: string,
  ): string | undefined {
    for (const message of snapshot ?? []) {
      if (message.role !== 'assistant') continue;
      const call = message.toolCalls?.find(
        (candidate) => candidate.id === toolCallId,
      );
      if (call) return call.function.arguments;
    }
    return undefined;
  }

  private static delegationOf(serialized: string): {
    agentName: string;
    task: string;
  } {
    const parsed: unknown = JSON.parse(serialized || '{}');
    const { agentName, task } = (parsed ?? {}) as Record<string, unknown>;
    if (typeof agentName !== 'string' || !agentName) {
      throw new Error('`agentName` is missing.');
    }
    if (typeof task !== 'string' || !task) {
      throw new Error('`task` is missing.');
    }
    return { agentName, task };
  }
}
