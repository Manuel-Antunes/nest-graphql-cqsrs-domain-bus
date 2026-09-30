import { randomUUID } from 'node:crypto';
import {
  type Artifact,
  type Message,
  type Part,
  Role,
  type Task,
  TaskState,
  type TaskStatusUpdateEvent,
} from '@a2a-js/sdk';
import {
  AgentEvent,
  type AgentExecutor,
  type ExecutionEventBus,
  type RequestContext,
} from '@a2a-js/sdk/server';
import {
  AIMessage,
  BaseMessage,
  ContentBlock,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { Command, type ToolCallStream } from '@langchain/langgraph';
import { CallbackHandler } from '@langfuse/langchain';
import { propagateAttributes, startActiveObservation } from '@langfuse/tracing';
import type { AgentRunStream, ReactAgent } from 'langchain';

import type { FileContentPart } from '../../files/domain/file-content-part';
import { MediaKinds } from '../../files/domain/media-kind';
import { A2aPart } from '../domain/a2a-part';
import { AgentExtensions } from '../domain/agent-extensions';
import {
  ClientToolsExtension,
  type ToolCallPayload,
  type ToolResultPayload,
} from '../domain/extensions/client-tools.extension';
import type {
  HitlRequestPayload,
  HitlResponsePayload,
} from '../domain/extensions/human-in-the-loop.extension';
import type { A2aRuntimeContext } from './a2a.middleware';

type HumanContentBlock =
  | ContentBlock.Text
  | ContentBlock.Multimodal.Data
  | FileContentPart;

const ANSWER_NODE = 'model_request';

const MAX_STREAMED_TOOL_RESULT_CHARS = 16_000;

type TurnStream = Pick<AgentRunStream, 'messages' | 'toolCalls' | 'output'>;

type PendingPause = {
  interruptId: string;
  answeredBy:
    | { via: 'client-tool'; toolCallId?: string; toolName?: string }
    | { via: 'decision' }
    | { via: 'unknown' };
};

type GraphSnapshot = {
  tasks?: {
    id: string;
    interrupts?: { id: string; value?: Record<string, unknown> }[];
  }[];
  values?: { messages?: BaseMessage[] };
};

type ClientToolCall = { id: string; name: string; args: unknown };

interface TurnAgent {
  getState(config: unknown): Promise<unknown>;
  streamEvents: unknown;
  stream: (...args: never[]) => unknown;
}

export class ReactAgentExecutor<T extends TurnAgent = ReactAgent>
  implements AgentExecutor
{
  private readonly abortControllers = new Map<string, AbortController>();

  private readonly cancelledTasks = new Set<string>();

  constructor(
    private agent: T,
    private readonly observability: {
      traceName?: string;
      attachmentScope?: string;
    } = {},
    private readonly extensions = new AgentExtensions(),
  ) {}

  public cancelTask = async (
    taskId: string,
    _eventBus: ExecutionEventBus,
  ): Promise<void> => {
    this.cancelledTasks.add(taskId);
    this.abortControllers.get(taskId)?.abort();
  };

  async execute(
    requestContext: RequestContext,
    eventBus: ExecutionEventBus,
  ): Promise<void> {
    const userMessage = requestContext.userMessage;
    const existingTask = requestContext.task;

    const { taskId, contextId } = requestContext;

    const abortController = new AbortController();
    this.abortControllers.set(taskId, abortController);

    const streamState: StreamTurnState = {
      messageId: `msg-${randomUUID()}`,
      artifactId: randomUUID(),
      text: '',
      artifactOpened: false,
      announcedToolCallIds: new Set(),
    };

    try {
      const config = {
        configurable: {
          thread_id: contextId,
          user_id: requestContext.context?.user?.userName,
          ...(this.observability.attachmentScope
            ? { attachment_scope: this.observability.attachmentScope }
            : {}),
        },
      };
      const graphState = (await this.agent.getState(config)) as GraphSnapshot;

      this.publishTaskAccepted(eventBus, {
        taskId,
        contextId,
        userMessage,
        existingTask,
      });

      const agentInput = this.resolveAgentInput({
        graphState,
        userMessage,
        contextId,
      });

      if (this.cancelledTasks.has(taskId)) {
        this.publishCanceled(eventBus, taskId, contextId);
        return;
      }

      const clientToolNames = new Set<string>();

      const traceName = this.observability.traceName ?? 'a2a-agent';
      const { finalResponse, clientToolCalls, isInputRequired, hitlRequests } =
        await propagateAttributes(
          {
            traceName,
            sessionId: contextId,
            userId: requestContext.context?.user?.userName,
            tags: [traceName],
          },
          () =>
            startActiveObservation(traceName, async (span) => {
              span.update({ input: A2aPart.textOf(userMessage.parts) });

              const langfuseHandler = new CallbackHandler();

              const clientTools =
                this.extensions.clientTools.toolsDeclaredFor(requestContext);

              await this.streamTurn(agentInput, {
                config,
                signal: abortController.signal,
                langfuseHandler,
                eventBus,
                ctx: { taskId, contextId },
                streamState,
                clientToolNames,
                publishToolEvents:
                  this.extensions.rendersToolEvents(requestContext),
                context: {
                  interruptOn: this.extensions.humanInTheLoop.interruptOnFor(
                    requestContext,
                    clientTools,
                  ),
                  a2a: {
                    clientTools,
                    clientInstructions:
                      this.extensions.promptAugmentation.instructionsFor(
                        requestContext,
                      ),
                    browserContext:
                      this.extensions.browserContext.contextFor(requestContext),
                    activatedExtensions:
                      requestContext.context?.activatedExtensions ?? [],
                    clientToolNames,
                  } satisfies A2aRuntimeContext,
                },
              });

              const finalState = (await this.agent.getState(
                config,
              )) as GraphSnapshot;
              const turn = this.readFinalTurn(finalState, streamState);
              span.update({ output: turn.finalResponse });
              return turn;
            }),
        );

      this.closeAnswerArtifact(
        eventBus,
        { taskId, contextId },
        streamState,
        finalResponse,
      );

      const agentMessage = this.buildAgentMessage({
        taskId,
        contextId,
        messageId: streamState.messageId,
        finalResponse,
        clientToolCalls,
        hitlRequests: this.extensions.humanInTheLoop.isActivatedFor(
          requestContext,
        )
          ? hitlRequests
          : [],
      });

      this.publishFinal(eventBus, {
        taskId,
        contextId,
        agentMessage,
        inputRequired: isInputRequired || clientToolCalls.length > 0,
      });
    } catch (error: unknown) {
      if (this.cancelledTasks.has(taskId) || this.isAbortError(error)) {
        this.publishCanceled(eventBus, taskId, contextId);
      } else {
        this.publishFailed(eventBus, taskId, contextId, error);
      }
    } finally {
      this.abortControllers.delete(taskId);
      this.cancelledTasks.delete(taskId);
    }
  }

  private resolveAgentInput(params: {
    graphState: GraphSnapshot;
    userMessage: Message;
    contextId: string;
  }): Parameters<T['stream']>[0] {
    const { graphState, userMessage, contextId } = params;

    const toolResults = this.extensions.clientTools.resultsIn({ userMessage });
    const hitlResponses = this.extensions.humanInTheLoop.responsesIn({
      userMessage,
    });

    const resumeCommand = this.buildResumeCommand(
      graphState,
      toolResults,
      hitlResponses,
    );
    if (resumeCommand) {
      return resumeCommand as Parameters<T['stream']>[0];
    }

    return {
      messages: this.mapUserMessage(userMessage, contextId),
    } as Parameters<T['stream']>[0];
  }

  private extractText(message: BaseMessage | undefined): string {
    if (!message) return '';
    const content = message.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((c) => {
          if (typeof c === 'string') return c;
          if (
            c &&
            typeof c === 'object' &&
            (c as { type?: string }).type === 'text'
          ) {
            return (c as { text?: string }).text ?? '';
          }
          return '';
        })
        .join('');
    }
    return '';
  }

  private fileContentBlocksFromA2aMessage(
    message: { messageId: string; parts: Part[] },
    threadId: string,
  ): HumanContentBlock[] {
    const blocks: HumanContentBlock[] = [];
    let fileIndex = 0;

    for (const part of message.parts) {
      if (!A2aPart.isFile(part)) continue;

      const mimeType = part.mediaType || 'application/octet-stream';
      const bytes = A2aPart.inlineBase64Of(part);
      const uri = bytes ? undefined : A2aPart.remoteUrlOf(part);

      if (!bytes && !uri) {
        blocks.push({
          type: 'text',
          text: `\n[Attachment: ${part.filename || 'unnamed'} (${mimeType})]`,
        });
        continue;
      }

      blocks.push({
        type: 'file',
        fileKind: MediaKinds.of(mimeType),
        mimeType,
        ...(bytes ? { data: bytes } : {}),
        ...(uri ? { uri } : {}),
        fileName: part.filename || undefined,
        sourceId: `${message.messageId}-file-${fileIndex}`,
        threadId,
      } satisfies FileContentPart);
      fileIndex += 1;
    }

    return blocks;
  }

  private mapUserMessage(m: Message, contextId: string): BaseMessage[] {
    const messages: BaseMessage[] = [];

    const textParts = A2aPart.textOf(m.parts);

    const contentParts: HumanContentBlock[] = [];
    if (textParts) {
      contentParts.push({ type: 'text', text: textParts });
    }
    contentParts.push(...this.fileContentBlocksFromA2aMessage(m, contextId));

    for (const result of this.extensions.clientTools.resultsIn({
      userMessage: m,
    })) {
      messages.push(
        new ToolMessage({
          id: result.toolCallId,
          tool_call_id: result.toolCallId,
          content:
            typeof result.result === 'string'
              ? result.result
              : JSON.stringify(result.result),
          ...(result.isError ? { status: 'error' as const } : {}),
        }),
      );
    }

    if (contentParts.length > 0) {
      messages.push(
        new HumanMessage({
          content: contentParts as never,
          id: m.messageId,
        }),
      );
    }

    return messages;
  }

  private readPendingPauses(graphState: GraphSnapshot): PendingPause[] {
    const interrupts = (graphState.tasks ?? []).flatMap(
      (task) => task.interrupts ?? [],
    );
    if (interrupts.length === 0) return [];

    const stateMessages = (graphState.values?.messages || []) as BaseMessage[];
    const lastAiMsg = [...stateMessages].reverse().find(AIMessage.isInstance) as
      | AIMessage
      | undefined;
    const pendingCalls = (lastAiMsg?.tool_calls || [])
      .filter((tc) => tc.name === ClientToolsExtension.ENVELOPE_TOOL)
      .map((tc) => ({
        toolCallId: (tc.args?.id || tc.id) as string | undefined,
        toolName: tc.args?.name as string | undefined,
      }));

    const alignable = pendingCalls.length === interrupts.length;

    return interrupts.map((pause, index) => {
      const value = pause.value;

      if (this.extensions.humanInTheLoop.isRequest(value)) {
        return {
          interruptId: pause.id,
          answeredBy: { via: 'decision' as const },
        };
      }

      const declared = (value as { clientTool?: Record<string, unknown> })
        ?.clientTool;
      if (declared || alignable) {
        const args = (declared?.args ?? {}) as Record<string, unknown>;
        const fallback = alignable ? pendingCalls[index] : undefined;
        return {
          interruptId: pause.id,
          answeredBy: {
            via: 'client-tool' as const,
            toolCallId:
              (args.id as string | undefined) ??
              (declared?.id as string | undefined) ??
              fallback?.toolCallId,
            toolName:
              (args.name as string | undefined) ??
              (declared?.name as string | undefined) ??
              fallback?.toolName,
          },
        };
      }

      return { interruptId: pause.id, answeredBy: { via: 'unknown' as const } };
    });
  }

  private buildResumeCommand(
    graphState: GraphSnapshot,
    toolResults: { toolCallId: string; toolName: string; result: unknown }[],
    hitlResponses: HitlResponsePayload[] = [],
  ): Command | null {
    const pauses = this.readPendingPauses(graphState);
    if (pauses.length === 0) return null;

    const resumeMap: Record<string, unknown> = {};

    for (const pause of pauses) {
      if (pause.answeredBy.via === 'decision') {
        const answer = hitlResponses.find(
          (r) => r.interruptId === pause.interruptId,
        );
        if (answer) {
          resumeMap[pause.interruptId] = { decisions: answer.decisions };
        }
        continue;
      }

      if (pause.answeredBy.via === 'client-tool') {
        const { toolCallId, toolName } = pause.answeredBy;
        const result = toolResults.find(
          (r) =>
            (toolCallId && r.toolCallId === toolCallId) ||
            (toolName && r.toolName === toolName),
        );
        if (result) resumeMap[pause.interruptId] = result.result;
      }
    }

    if (Object.keys(resumeMap).length === 0) return null;

    return new Command({ resume: resumeMap });
  }

  private async streamTurn(
    agentInput: Parameters<T['stream']>[0],
    options: TurnStreamOptions,
  ): Promise<void> {
    const run = (await (
      this.agent.streamEvents as unknown as (
        input: unknown,
        config: unknown,
      ) => Promise<TurnStream>
    )(agentInput, {
      ...options.config,
      version: 'v3',
      signal: options.signal,
      ...(options.langfuseHandler
        ? { callbacks: [options.langfuseHandler] }
        : {}),
      context: options.context,
    })) satisfies TurnStream;

    const settled = await Promise.allSettled([
      this.streamModelOutput(run, options),
      this.streamToolResults(run, options),
      run.output,
    ]);

    const failure = settled.find((result) => result.status === 'rejected');
    if (failure) throw (failure as PromiseRejectedResult).reason;
  }

  private async streamModelOutput(
    run: TurnStream,
    options: TurnStreamOptions,
  ): Promise<void> {
    const { eventBus, ctx, streamState } = options;

    for await (const message of run.messages) {
      if (message.node !== ANSWER_NODE) continue;

      for await (const event of message) {
        if (
          event.event === 'content-block-delta' &&
          event.delta.type === 'text-delta' &&
          event.delta.text
        ) {
          streamState.text += event.delta.text;
          this.publishAnswerDelta(eventBus, ctx, streamState, event.delta.text);
          continue;
        }

        if (
          options.publishToolEvents &&
          event.event === 'content-block-finish' &&
          event.content.type === 'tool_call'
        ) {
          this.publishModelToolCall(
            options,
            event.content as ContentBlock.Tools.ToolCall,
          );
        }
      }
    }
  }

  private publishModelToolCall(
    options: TurnStreamOptions,
    call: ContentBlock.Tools.ToolCall,
  ): void {
    const { eventBus, ctx, streamState } = options;

    if (call.name === ClientToolsExtension.ENVELOPE_TOOL) return;

    if (call.id) {
      if (streamState.announcedToolCallIds.has(call.id)) return;
      streamState.announcedToolCallIds.add(call.id);
    }

    this.publishToolCall(eventBus, ctx, streamState, {
      type: 'tool-call',
      toolCallId: call.id ?? '',
      toolName: call.name,
      args: call.args ?? {},
      execution: options.clientToolNames.has(call.name) ? 'client' : 'server',
    });
  }

  private async streamToolResults(
    run: TurnStream,
    options: TurnStreamOptions,
  ): Promise<void> {
    const { eventBus, ctx, streamState } = options;
    const pendingResults: Promise<void>[] = [];

    try {
      for await (const call of run.toolCalls) {
        const isClientCall =
          call.name === ClientToolsExtension.ENVELOPE_TOOL ||
          options.clientToolNames.has(call.name);

        if (isClientCall || !options.publishToolEvents) {
          this.discardToolOutput(call);
          continue;
        }

        pendingResults.push(
          this.publishToolResultWhenSettled(eventBus, ctx, streamState, call),
        );
      }
    } finally {
      await Promise.allSettled(pendingResults);
    }
  }

  private discardToolOutput(call: ToolCallStream): void {
    void call.output.catch(() => undefined);
  }

  private async publishToolResultWhenSettled(
    eventBus: ExecutionEventBus,
    ctx: { taskId: string; contextId: string },
    streamState: StreamTurnState,
    call: ToolCallStream,
  ): Promise<void> {
    const [status, output, error] = await Promise.all([
      call.status,
      call.output.catch(() => undefined),
      call.error,
    ]);

    if (status === 'error') {
      this.publishToolResult(eventBus, ctx, streamState, {
        type: 'tool-result',
        toolCallId: call.callId,
        toolName: call.name,
        result: error ?? 'A ferramenta falhou.',
        isError: true,
      });
      return;
    }

    if (output === undefined) return;

    this.publishToolResult(eventBus, ctx, streamState, {
      type: 'tool-result',
      toolCallId: call.callId,
      toolName: call.name,
      result: this.clipToolResult(output),
    });
  }

  private clipToolResult(output: unknown): unknown {
    const clip = (text: string) =>
      text.length > MAX_STREAMED_TOOL_RESULT_CHARS
        ? `${text.slice(0, MAX_STREAMED_TOOL_RESULT_CHARS)}\n…[resultado truncado — ${text.length} caracteres no total]`
        : text;

    if (typeof output === 'string') return clip(output);

    let serialized: string;
    try {
      serialized = JSON.stringify(output) ?? '';
    } catch {
      return '[resultado não serializável]';
    }
    return serialized.length > MAX_STREAMED_TOOL_RESULT_CHARS
      ? clip(serialized)
      : output;
  }

  private publishTaskAccepted(
    eventBus: ExecutionEventBus,
    params: {
      taskId: string;
      contextId: string;
      userMessage: Message;
      existingTask: Task | undefined;
    },
  ): void {
    const { taskId, contextId, userMessage, existingTask } = params;

    const task: Task = existingTask ?? {
      id: taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_SUBMITTED,
        message: undefined,
        timestamp: new Date().toISOString(),
      },
      artifacts: [],
      history: [userMessage],
      metadata: userMessage.metadata,
    };
    eventBus.publish(AgentEvent.task(task));

    eventBus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId,
        status: {
          state: TaskState.TASK_STATE_WORKING,
          message: undefined,
          timestamp: new Date().toISOString(),
        },
        metadata: undefined,
      }),
    );
  }

  private publishToolCall(
    eventBus: ExecutionEventBus,
    ctx: { taskId: string; contextId: string },
    streamState: StreamTurnState,
    payload: ToolCallPayload,
  ): void {
    if (!payload.toolCallId || !payload.toolName) return;
    this.publishWorkingPayload(eventBus, ctx, streamState, payload);
  }

  private publishToolResult(
    eventBus: ExecutionEventBus,
    ctx: { taskId: string; contextId: string },
    streamState: StreamTurnState,
    payload: ToolResultPayload,
  ): void {
    if (!payload.toolCallId || !payload.toolName) return;
    this.publishWorkingPayload(eventBus, ctx, streamState, payload);
  }

  private publishWorkingPayload(
    eventBus: ExecutionEventBus,
    ctx: { taskId: string; contextId: string },
    streamState: StreamTurnState,
    payload: ToolCallPayload | ToolResultPayload,
  ): void {
    eventBus.publish(
      AgentEvent.statusUpdate({
        taskId: ctx.taskId,
        contextId: ctx.contextId,
        status: {
          state: TaskState.TASK_STATE_WORKING,
          message: {
            messageId: streamState.messageId,
            contextId: ctx.contextId,
            taskId: ctx.taskId,
            role: Role.ROLE_AGENT,
            parts: [this.extensions.clientTools.encode(payload)],
            metadata: undefined,
            extensions: [],
            referenceTaskIds: [],
          },
          timestamp: new Date().toISOString(),
        },
        metadata: undefined,
      }),
    );
  }

  private publishAnswerDelta(
    eventBus: ExecutionEventBus,
    ctx: { taskId: string; contextId: string },
    streamState: StreamTurnState,
    delta: string,
  ): void {
    const opening = !streamState.artifactOpened;
    streamState.artifactOpened = true;

    eventBus.publish(
      AgentEvent.artifactUpdate({
        taskId: ctx.taskId,
        contextId: ctx.contextId,
        artifact: this.answerArtifact(streamState, [A2aPart.text(delta)]),
        append: !opening,
        lastChunk: false,
        metadata: undefined,
      }),
    );
  }

  private closeAnswerArtifact(
    eventBus: ExecutionEventBus,
    ctx: { taskId: string; contextId: string },
    streamState: StreamTurnState,
    finalResponse: string,
  ): void {
    const nothingStreamed = !streamState.artifactOpened;
    if (nothingStreamed && !finalResponse) return;

    eventBus.publish(
      AgentEvent.artifactUpdate({
        taskId: ctx.taskId,
        contextId: ctx.contextId,
        artifact: this.answerArtifact(
          streamState,
          nothingStreamed ? [A2aPart.text(finalResponse)] : [],
        ),
        append: !nothingStreamed,
        lastChunk: true,
        metadata: undefined,
      }),
    );
  }

  private answerArtifact(
    streamState: StreamTurnState,
    parts: Part[],
  ): Artifact {
    return {
      artifactId: streamState.artifactId,
      name: 'Result',
      description: "The agent's answer for this turn.",
      parts,
      metadata: undefined,
      extensions: [],
    };
  }

  private publishFinal(
    eventBus: ExecutionEventBus,
    params: {
      taskId: string;
      contextId: string;
      agentMessage: Message;
      inputRequired: boolean;
    },
  ): void {
    const finalUpdate: TaskStatusUpdateEvent = {
      taskId: params.taskId,
      contextId: params.contextId,
      status: {
        state: params.inputRequired
          ? TaskState.TASK_STATE_INPUT_REQUIRED
          : TaskState.TASK_STATE_COMPLETED,
        message: params.agentMessage,
        timestamp: new Date().toISOString(),
      },
      metadata: undefined,
    };
    eventBus.publish(AgentEvent.statusUpdate(finalUpdate));
  }

  private publishCanceled(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
  ): void {
    eventBus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId,
        status: {
          state: TaskState.TASK_STATE_CANCELED,
          message: undefined,
          timestamp: new Date().toISOString(),
        },
        metadata: undefined,
      }),
    );
  }

  private publishFailed(
    eventBus: ExecutionEventBus,
    taskId: string,
    contextId: string,
    error: unknown,
  ): void {
    eventBus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId,
        status: {
          state: TaskState.TASK_STATE_FAILED,
          message: {
            messageId: randomUUID(),
            contextId,
            taskId,
            role: Role.ROLE_AGENT,
            parts: [
              A2aPart.text(
                `Agent error: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              ),
            ],
            metadata: undefined,
            extensions: [],
            referenceTaskIds: [],
          },
          timestamp: new Date().toISOString(),
        },
        metadata: undefined,
      }),
    );
  }

  private readFinalTurn(
    finalState: GraphSnapshot,
    streamState: StreamTurnState,
  ): {
    finalResponse: string;
    clientToolCalls: ClientToolCall[];
    hitlRequests: HitlRequestPayload[];
    isInputRequired: boolean;
  } {
    const messages = (finalState.values?.messages || []) as BaseMessage[];
    const lastAiMsg = [...messages].reverse().find(AIMessage.isInstance) as
      | AIMessage
      | undefined;

    const finalResponse = streamState.text || this.extractText(lastAiMsg);

    const clientToolCalls: ClientToolCall[] = (lastAiMsg?.tool_calls || [])
      .filter((tc) => tc.name === ClientToolsExtension.ENVELOPE_TOOL)
      .map((tc) => {
        const args = (tc.args || {}) as {
          id?: string;
          name?: string;
          args?: unknown;
        };
        return {
          id: (args.id || tc.id) as string,
          name: args.name as string,
          args: args.args,
        };
      })
      .filter((tc) => tc.id && tc.name);

    const isInputRequired = (finalState.tasks || []).some(
      (t) => (t.interrupts?.length ?? 0) > 0,
    );

    return {
      finalResponse,
      clientToolCalls,
      isInputRequired,
      hitlRequests: this.extensions.humanInTheLoop.requestsParkedOn(
        (finalState.tasks ?? []).flatMap((task) => task.interrupts ?? []),
      ),
    };
  }

  private buildAgentMessage(params: {
    taskId: string;
    contextId: string;
    messageId: string;
    finalResponse: string;
    clientToolCalls: ClientToolCall[];
    hitlRequests: HitlRequestPayload[];
  }): Message {
    const parts: Part[] = [];

    if (params.finalResponse) {
      parts.push(A2aPart.text(params.finalResponse));
    }

    const seen = new Set<string>();
    for (const toolCall of params.clientToolCalls) {
      if (seen.has(toolCall.id)) continue;
      seen.add(toolCall.id);

      const payload: ToolCallPayload = {
        type: 'tool-call',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.args,
        execution: 'client',
      };
      parts.push(this.extensions.clientTools.encode(payload));
    }

    for (const request of params.hitlRequests) {
      parts.push(this.extensions.humanInTheLoop.encode(request));
    }

    return {
      messageId: params.messageId,
      contextId: params.contextId,
      taskId: params.taskId,
      role: Role.ROLE_AGENT,
      parts,
      metadata: undefined,
      extensions: [],
      referenceTaskIds: [],
    };
  }

  private isAbortError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.name === 'AbortError' || error.name === 'AbortSignal';
    }
    return false;
  }
}

type StreamTurnState = {
  messageId: string;
  artifactId: string;
  text: string;
  artifactOpened: boolean;
  announcedToolCallIds: Set<string>;
};

type TurnStreamOptions = {
  config: {
    configurable: {
      thread_id: string;
      user_id?: string;
      attachment_scope?: string;
    };
  };
  signal: AbortSignal;
  langfuseHandler?: CallbackHandler;
  context: Record<string, unknown>;
  eventBus: ExecutionEventBus;
  ctx: { taskId: string; contextId: string };
  streamState: StreamTurnState;
  clientToolNames: ReadonlySet<string>;
  publishToolEvents: boolean;
};
