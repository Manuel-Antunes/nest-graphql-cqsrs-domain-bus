import {
  AbstractAgent,
  type AgentConfig,
  type BaseEvent,
  EventType,
  type RunAgentInput,
} from '@ag-ui/client';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ProtocolEvent } from '@langchain/langgraph';
import { CallbackHandler } from '@langfuse/langchain';
import { propagateAttributes } from '@langfuse/tracing';
import { Observable, type Subscriber } from 'rxjs';

import { AgentRunContext } from '../../agents/context/agent-run-context';
import type { AgUiRuntimeContext } from './ag-ui.middleware';
import { AgUiMessages } from './ag-ui-messages';
import { AgUiProtocolTranslator } from './ag-ui-protocol.translator';

export interface AgUiGraph {
  streamEvents: unknown;
  getState?: unknown;
}

export interface LangChainAgUiAgentConfig extends AgentConfig {
  readonly graph: AgUiGraph;
  readonly traceName?: string;
}

type GetState = (config: unknown) => Promise<{
  values?: { messages?: BaseMessage[] };
}>;

type StreamEvents = (
  input: unknown,
  config: unknown,
) => Promise<AsyncIterable<ProtocolEvent>>;

export class LangChainAgUiAgent extends AbstractAgent {
  private config: LangChainAgUiAgentConfig;

  constructor(config: LangChainAgUiAgentConfig) {
    super(config);
    this.config = config;
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const abort = new AbortController();
      void this.stream(input, subscriber, abort.signal);
      return () => abort.abort();
    });
  }

  override clone(): LangChainAgUiAgent {
    const cloned = super.clone() as LangChainAgUiAgent;
    cloned.config = this.config;
    return cloned;
  }

  static unseen(
    messages: readonly BaseMessage[],
    known: ReadonlySet<string> | undefined,
  ): BaseMessage[] {
    if (!known?.size) return [...messages];
    const lastKnown = messages.findLastIndex(
      (message) => message.id !== undefined && known.has(message.id),
    );
    if (lastKnown >= 0) return messages.slice(lastKnown + 1);
    return messages.slice(
      messages.findLastIndex((message) => AIMessage.isInstance(message)) + 1,
    );
  }

  private async knownMessageIds(config: {
    configurable: Record<string, unknown>;
  }): Promise<Set<string> | undefined> {
    const getState = this.config.graph.getState as GetState | undefined;
    if (typeof getState !== 'function') return undefined;
    try {
      const state = await getState.call(this.config.graph, config);
      return new Set(
        (state.values?.messages ?? []).flatMap((message) =>
          message.id ? [message.id] : [],
        ),
      );
    } catch (error) {
      if (error instanceof Error && /checkpointer/i.test(error.message)) {
        return undefined;
      }
      throw error;
    }
  }

  private async stream(
    input: RunAgentInput,
    subscriber: Subscriber<BaseEvent>,
    signal: AbortSignal,
  ): Promise<void> {
    const { threadId, runId } = input;
    const translator = new AgUiProtocolTranslator();
    subscriber.next({ type: EventType.RUN_STARTED, threadId, runId });
    try {
      const traceName = this.config.traceName ?? 'ag-ui-agent';
      const agent = AgentRunContext.current();
      const userId = agent?.isAuthenticated ? agent.userName : undefined;
      const configurable = {
        thread_id: threadId,
        user_id: userId,
        actor_id: agent?.actorId,
        tenant: agent?.tenant,
      };
      await propagateAttributes(
        {
          traceName,
          sessionId: threadId,
          userId,
          tags: [traceName],
        },
        async () => {
          const { messages, instructions } = AgUiMessages.toLangChain(
            input.messages,
          );
          const run = await (this.config.graph.streamEvents as StreamEvents)(
            {
              messages: LangChainAgUiAgent.unseen(
                messages,
                await this.knownMessageIds({ configurable }),
              ),
            },
            {
              version: 'v3',
              configurable,
              signal,
              callbacks: [new CallbackHandler()],
              context: {
                [AgentRunContext.KEY]: agent,
                agUi: {
                  tools: input.tools,
                  context: input.context,
                  instructions,
                  frontendToolNames: new Set<string>(),
                } satisfies AgUiRuntimeContext,
              },
            },
          );
          for await (const event of run) {
            if (signal.aborted) return;
            for (const translated of translator.translate(event)) {
              subscriber.next(translated);
            }
          }
        },
      );
      if (signal.aborted) return;
      for (const event of translator.finish()) subscriber.next(event);
      subscriber.next({ type: EventType.RUN_FINISHED, threadId, runId });
      subscriber.complete();
    } catch (error) {
      if (signal.aborted) {
        subscriber.complete();
        return;
      }
      for (const event of translator.finish()) subscriber.next(event);
      subscriber.next({
        type: EventType.RUN_ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      subscriber.complete();
    }
  }
}
