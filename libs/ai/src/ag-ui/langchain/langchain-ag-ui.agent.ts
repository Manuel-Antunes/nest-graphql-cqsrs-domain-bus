import {
  AbstractAgent,
  type AgentConfig,
  type BaseEvent,
  EventType,
  type RunAgentInput,
} from '@ag-ui/client';
import type { ProtocolEvent } from '@langchain/langgraph';
import { CallbackHandler } from '@langfuse/langchain';
import { propagateAttributes } from '@langfuse/tracing';
import { Observable, type Subscriber } from 'rxjs';

import type { AgUiRuntimeContext } from './ag-ui.middleware';
import { AgUiMessages } from './ag-ui-messages';
import { AgUiProtocolTranslator } from './ag-ui-protocol.translator';

export interface AgUiGraph {
  streamEvents: unknown;
}

export interface LangChainAgUiAgentConfig extends AgentConfig {
  readonly graph: AgUiGraph;
  readonly traceName?: string;
  readonly userOf?: () => string | undefined;
}

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
      const userId = this.config.userOf?.();
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
            { messages },
            {
              version: 'v3',
              configurable: { thread_id: threadId, user_id: userId },
              signal,
              callbacks: [new CallbackHandler()],
              context: {
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
