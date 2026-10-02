import {
  BedrockAgentCoreClient,
  type BedrockAgentCoreClientConfig,
  CreateEventCommand,
  GetMemoryRecordCommand,
  type MemoryRecordSummary,
  type PayloadType,
  RetrieveMemoryRecordsCommand,
  Role,
} from '@aws-sdk/client-bedrock-agentcore';
import { type BaseMessage, isBaseMessage } from '@langchain/core/messages';
import {
  BaseStore,
  type GetOperation,
  type Item,
  type Operation,
  type OperationResults,
  type PutOperation,
  type SearchItem,
  type SearchOperation,
} from '@langchain/langgraph-checkpoint';

import type { AgentCoreMemoryClient } from './agentcore-event-client';

export interface AgentCoreMemoryStoreOptions {
  /** A client of your own; otherwise one is built from `clientConfig`. */
  readonly client?: AgentCoreMemoryClient;
  readonly clientConfig?: BedrockAgentCoreClientConfig;
  /**
   * Searches the records under the namespace (`namespacePath`) — the default — or only those stored
   * at exactly that namespace (`namespace`).
   */
  readonly hierarchicalSearch?: boolean;
}

type ConversationalRole = (typeof Role)[keyof typeof Role];

/**
 * A LangGraph store on Amazon Bedrock AgentCore Memory, for long-term memory: what is put is a
 * conversation message, saved as a conversational event of the namespace `[actorId, sessionId]`, for
 * the memory's strategies to extract facts, preferences and summaries from in the background; what is
 * searched is those extracted records, semantically, under a namespace such as
 * `['preferences', actorId]`.
 *
 * A TypeScript port of `AgentCoreMemoryStore` from `langgraph-checkpoint-aws` — see this library's
 * NOTICE.md.
 */
export class AgentCoreMemoryStore extends BaseStore {
  static readonly USER_AGENT =
    'x-client-framework:langgraph_agentcore_memory_store';

  private readonly client: AgentCoreMemoryClient;
  private readonly hierarchicalSearch: boolean;

  constructor(
    readonly memoryId: string,
    options: AgentCoreMemoryStoreOptions = {},
  ) {
    super();
    this.client =
      options.client ??
      new BedrockAgentCoreClient({
        maxAttempts: 4,
        retryMode: 'adaptive',
        ...options.clientConfig,
        customUserAgent: AgentCoreMemoryStore.USER_AGENT,
      });
    this.hierarchicalSearch = options.hierarchicalSearch ?? true;
  }

  async batch<Op extends Operation[]>(
    operations: Op,
  ): Promise<OperationResults<Op>> {
    const results: unknown[] = [];
    for (const operation of operations) {
      if ('value' in operation) {
        await this.putMessage(operation);
        results.push(undefined);
      } else if ('namespacePrefix' in operation) {
        results.push(await this.searchRecords(operation));
      } else if ('key' in operation) {
        results.push(await this.getRecord(operation));
      } else {
        results.push([]);
      }
    }
    return results as OperationResults<Op>;
  }

  /** LangChain messages as the conversational turns AgentCore extracts memories from. */
  static conversationalOf(
    messages: readonly BaseMessage[],
  ): PayloadType.ConversationalMember[] {
    return messages.flatMap((message) => {
      if (message.additional_kwargs?.event_id !== undefined) return [];
      const text = message.text;
      if (!text.trim()) return [];
      const role = AgentCoreMemoryStore.roleOf(message);
      return role ? [{ conversational: { role, content: { text } } }] : [];
    });
  }

  private async putMessage({ namespace, value }: PutOperation): Promise<void> {
    if (value === null) {
      process.emitWarning(
        'Delete operations are not supported in AgentCore Memory',
      );
      return;
    }
    const message: unknown = value.message;
    if (!isBaseMessage(message)) {
      throw new Error(
        "Value must contain a 'message' key with a BaseMessage object",
      );
    }
    if (namespace.length !== 2) {
      throw new Error('Namespace must be a tuple of (actorId, sessionId)');
    }
    const [actorId, sessionId] = namespace;
    const payload = AgentCoreMemoryStore.conversationalOf([message]);
    if (payload.length === 0) {
      process.emitWarning(
        `No valid event messages to create for message type: ${message.type}`,
      );
      return;
    }
    await this.client.send(
      new CreateEventCommand({
        memoryId: this.memoryId,
        actorId,
        sessionId,
        eventTimestamp: new Date(),
        payload,
      }),
    );
  }

  private async getRecord({
    namespace,
    key,
  }: GetOperation): Promise<Item | null> {
    try {
      const { memoryRecord } = await this.client.send(
        new GetMemoryRecordCommand({
          memoryId: this.memoryId,
          memoryRecordId: key,
        }),
      );
      return memoryRecord
        ? AgentCoreMemoryStore.itemOf(memoryRecord, namespace)
        : null;
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'ResourceNotFoundException'
      ) {
        return null;
      }
      throw error;
    }
  }

  private async searchRecords({
    namespacePrefix,
    query,
    limit = 10,
  }: SearchOperation): Promise<SearchItem[]> {
    if (!query) {
      process.emitWarning('Search requires a query for AgentCore Memory');
      return [];
    }
    const namespace = AgentCoreMemoryStore.namespaceOf(namespacePrefix);
    const { memoryRecordSummaries = [] } = await this.client.send(
      new RetrieveMemoryRecordsCommand({
        memoryId: this.memoryId,
        searchCriteria: { searchQuery: query, topK: limit },
        maxResults: limit,
        ...(this.hierarchicalSearch
          ? { namespacePath: namespace }
          : { namespace }),
      }),
    );
    return memoryRecordSummaries.map((record) => ({
      ...AgentCoreMemoryStore.itemOf(record, namespacePrefix),
      ...(record.score !== undefined ? { score: Number(record.score) } : {}),
    }));
  }

  private static itemOf(
    record: Pick<
      MemoryRecordSummary,
      | 'memoryRecordId'
      | 'content'
      | 'memoryStrategyId'
      | 'namespaces'
      | 'createdAt'
    >,
    namespace: string[],
  ): Item {
    const createdAt = record.createdAt
      ? new Date(record.createdAt)
      : new Date();
    return {
      namespace,
      key: record.memoryRecordId ?? crypto.randomUUID(),
      value: {
        content: record.content?.text ?? '',
        memory_strategy_id: record.memoryStrategyId,
        namespaces: record.namespaces ?? [],
      },
      createdAt,
      updatedAt: createdAt,
    };
  }

  private static namespaceOf(namespace: readonly string[]): string {
    return `/${namespace.join('/')}`;
  }

  private static roleOf(message: BaseMessage): ConversationalRole | undefined {
    switch (message.type) {
      case 'human':
        return Role.USER;
      case 'ai':
        return Role.ASSISTANT;
      case 'tool':
        return Role.TOOL;
      case 'system':
        return Role.OTHER;
      default:
        return undefined;
    }
  }
}
