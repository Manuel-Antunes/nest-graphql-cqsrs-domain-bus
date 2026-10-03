import { randomUUID } from 'node:crypto';
import { LangGraphAgent, type LangGraphAgentConfig } from '@ag-ui/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { Command, type StateSnapshot } from '@langchain/langgraph';
import { CallbackHandler } from '@langfuse/langchain';

import { AgentRunContext } from '../../agents/context/agent-run-context';

export interface InProcessGraph {
  getGraphAsync(config?: RunnableConfig): Promise<{
    nodes: Record<string, { id: string }>;
    edges: readonly { source: string; target: string }[];
  }>;
  getState(config: RunnableConfig): Promise<StateSnapshot>;
  getStateHistory(config: RunnableConfig): AsyncIterable<StateSnapshot>;
  updateState(
    config: RunnableConfig,
    values: Record<string, unknown>,
    asNode?: string,
  ): Promise<RunnableConfig>;
  streamEvents(
    input: unknown,
    config: RunnableConfig & { version: 'v2' },
  ): AsyncIterable<unknown>;
}

export interface InProcessLangGraphOptions {
  readonly graphId: string;
}

interface StreamPayload {
  readonly input?: Record<string, unknown> | null;
  readonly config?: RunnableConfig;
  readonly command?: ConstructorParameters<typeof Command>[0];
}

interface ThreadState {
  readonly values: Record<string, unknown>;
  readonly next: readonly string[];
  readonly tasks: readonly Record<string, unknown>[];
  readonly checkpoint: Record<string, unknown> | null;
  readonly metadata: Record<string, unknown>;
  readonly created_at: string | null;
  readonly parent_checkpoint: Record<string, unknown> | null;
}

interface StreamChunk {
  readonly event: string;
  readonly data: unknown;
}

type LangGraphClient = NonNullable<LangGraphAgentConfig['client']>;

export class InProcessLangGraphClient {
  static readonly DEPLOYMENT_URL = 'in-process://langgraph';
  static readonly INPUT_KEYS = ['messages', 'tools', 'copilotkit', 'ag-ui'];

  private readonly running = new Map<string, AbortController>();

  readonly assistants = {
    search: async () => [this.assistant()],
    get: async () => this.assistant(),
    getGraph: async () => {
      const drawable = await this.graph.getGraphAsync();
      return {
        nodes: Object.values(drawable.nodes).map((node) => ({ id: node.id })),
        edges: drawable.edges.map((edge) => ({
          source: edge.source,
          target: edge.target,
        })),
      };
    },
    getSchemas: async () => {
      const keys = Object.fromEntries(
        InProcessLangGraphClient.INPUT_KEYS.map((key) => [key, {}]),
      );
      return {
        graph_id: this.options.graphId,
        input_schema: { properties: keys },
        output_schema: { properties: keys },
        context_schema: { properties: {} },
        config_schema: { properties: {} },
      };
    },
  };

  readonly threads = {
    get: async (threadId: string) => this.thread(threadId),
    create: async (payload?: {
      threadId?: string;
      metadata?: Record<string, unknown>;
    }) => this.thread(payload?.threadId ?? randomUUID(), payload?.metadata),
    getState: async (threadId: string) =>
      InProcessLangGraphClient.stateOf(
        await this.graph.getState(this.configOf(threadId)),
      ),
    updateState: async (
      threadId: string,
      { values, asNode }: { values?: Record<string, unknown>; asNode?: string },
    ) => {
      const config = await this.graph.updateState(
        this.configOf(threadId),
        values ?? {},
        asNode,
      );
      return { checkpoint: config.configurable ?? {} };
    },
    getHistory: async (threadId: string) => {
      const history: ThreadState[] = [];
      for await (const snapshot of this.graph.getStateHistory(
        this.configOf(threadId),
      )) {
        history.push(InProcessLangGraphClient.stateOf(snapshot));
      }
      return history;
    },
  };

  readonly runs = {
    stream: (threadId: string, _assistantId: string, payload: StreamPayload) =>
      this.stream(threadId, payload),
    cancel: async (threadId: string) => {
      this.running.get(threadId)?.abort();
    },
  };

  constructor(
    private readonly graph: InProcessGraph,
    private readonly options: InProcessLangGraphOptions,
  ) {}

  static agentOver(
    graph: InProcessGraph,
    options: InProcessLangGraphOptions,
  ): LangGraphAgent {
    return new LangGraphAgent({
      graphId: options.graphId,
      deploymentUrl: InProcessLangGraphClient.DEPLOYMENT_URL,
      client: new InProcessLangGraphClient(
        graph,
        options,
      ) as unknown as LangGraphClient,
    });
  }

  private async *stream(
    threadId: string,
    { input, config, command }: StreamPayload,
  ): AsyncGenerator<StreamChunk> {
    const abort = new AbortController();
    this.running.set(threadId, abort);
    try {
      const runId = randomUUID();
      yield { event: 'metadata', data: { run_id: runId, thread_id: threadId } };
      const events = this.graph.streamEvents(
        command?.resume !== undefined || command?.goto !== undefined
          ? new Command(command)
          : input,
        {
          ...config,
          ...this.configOf(threadId, config?.configurable),
          runName: this.options.graphId,
          signal: abort.signal,
          callbacks: [new CallbackHandler()],
          version: 'v2',
        },
      );
      for await (const event of events) {
        yield {
          event: 'events',
          data: InProcessLangGraphClient.identified(event),
        };
      }
      yield {
        event: 'values',
        data: (await this.graph.getState(this.configOf(threadId))).values,
      };
    } finally {
      if (this.running.get(threadId) === abort) this.running.delete(threadId);
    }
  }

  private static identified(event: unknown): unknown {
    const {
      event: name,
      run_id,
      data,
    } = event as {
      event?: string;
      run_id?: string;
      data?: { chunk?: BaseMessage };
    };
    if (name === 'on_chat_model_stream' && data?.chunk?.id == null && run_id) {
      data?.chunk?._updateId(`run-${run_id}`);
    }
    return event;
  }

  private configOf(
    threadId: string,
    configurable: Record<string, unknown> = {},
  ): RunnableConfig {
    const caller = AgentRunContext.current();
    return {
      configurable: {
        ...configurable,
        thread_id: threadId,
        actor_id: caller?.actorId,
        tenant: caller?.tenant,
        user_id: caller?.isAuthenticated ? caller.userName : undefined,
      },
    };
  }

  private assistant() {
    return {
      assistant_id: this.options.graphId,
      graph_id: this.options.graphId,
      name: this.options.graphId,
      config: {},
      metadata: {},
      version: 1,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    };
  }

  private thread(threadId: string, metadata: Record<string, unknown> = {}) {
    return {
      thread_id: threadId,
      metadata,
      status: 'idle',
      values: {},
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    };
  }

  private static stateOf(snapshot: StateSnapshot | undefined): ThreadState {
    return {
      values: (snapshot?.values ?? {}) as Record<string, unknown>,
      next: snapshot?.next ?? [],
      tasks: (snapshot?.tasks ?? []).map((task) => ({
        ...task,
        interrupts: task.interrupts ?? [],
      })),
      checkpoint: snapshot?.config?.configurable ?? null,
      metadata: { ...snapshot?.metadata },
      created_at: snapshot?.createdAt ?? null,
      parent_checkpoint: snapshot?.parentConfig?.configurable ?? null,
    };
  }
}
