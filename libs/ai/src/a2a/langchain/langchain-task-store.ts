import {
  type Artifact,
  type ListTasksRequest,
  type ListTasksResponse,
  type Message,
  Role,
  type Task,
  TaskState,
  taskStateFromJSON,
  taskStateToJSON,
} from '@a2a-js/sdk';
import type { ServerCallContext, TaskStore } from '@a2a-js/sdk/server';
import type { BaseMessage } from '@langchain/core/messages';
import type { BaseCheckpointSaver, BaseStore } from '@langchain/langgraph';

import { foldLangChainMessages } from '../../checkpoint/fold-langchain-messages';
import { toParts } from '../../domain/messages/langchain-message-parts';
import { ChatMessageEncoder } from '../domain/chat-message-encoder';
import { A2aTenancy } from '../server/a2a-tenancy';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type ArtifactIndexEntry = Pick<
  Artifact,
  'artifactId' | 'name' | 'description' | 'extensions' | 'metadata'
>;

interface TaskEnvelope {
  taskId: string;
  contextId: string;
  state: string;
  statusTimestamp?: string;
  statusMessage?: Message;
  artifacts: ArtifactIndexEntry[];
  metadata?: Record<string, unknown>;
  historyStart: number;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LangChainTaskStoreOptions {
  store: BaseStore;
  checkpointer: BaseCheckpointSaver;
}

export class LangChainTaskStore implements TaskStore {
  private readonly store: BaseStore;
  private readonly checkpointer: BaseCheckpointSaver;
  private readonly encoder = new ChatMessageEncoder();

  constructor(options: LangChainTaskStoreOptions) {
    this.store = options.store;
    this.checkpointer = options.checkpointer;
  }

  private tasksNamespace(userId: string | null, contextId: string): string[] {
    return ['a2a', userId ?? '_anon', 'tasks', contextId];
  }

  private indexNamespace(userId: string | null): string[] {
    return ['a2a', userId ?? '_anon', 'task-index'];
  }

  private ownerOf(context: ServerCallContext): string | null {
    return A2aTenancy.actorOf(context.tenant, context.user) ?? null;
  }

  async save(task: Task, context: ServerCallContext): Promise<void> {
    const userId = this.ownerOf(context);
    const existing = await this.readEnvelope(task.id, userId);

    const envelope: TaskEnvelope = {
      taskId: task.id,
      contextId: task.contextId,
      userId,
      state: taskStateToJSON(
        task.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED,
      ),
      statusTimestamp: task.status?.timestamp,
      statusMessage: task.status?.message
        ? stripHistory(task.status.message)
        : undefined,
      artifacts: (task.artifacts ?? []).map((artifact) => ({
        artifactId: artifact.artifactId,
        name: artifact.name,
        description: artifact.description,
        extensions: artifact.extensions,
        metadata: artifact.metadata,
      })),
      metadata: task.metadata as Record<string, unknown> | undefined,
      historyStart:
        existing?.historyStart ??
        (await this.announcementWatermark(task, userId)),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.store.put(
      this.tasksNamespace(userId, task.contextId),
      task.id,
      envelope as unknown as Record<string, unknown>,
      false,
    );

    if (!existing) {
      await this.store.put(
        this.indexNamespace(userId),
        task.id,
        { contextId: task.contextId },
        false,
      );
    }
  }

  async load(
    taskId: string,
    context: ServerCallContext,
  ): Promise<Task | undefined> {
    const userId = this.ownerOf(context);
    const envelope = await this.readEnvelope(taskId, userId);
    if (!envelope) return undefined;

    const siblings = await this.envelopesOf(userId, envelope.contextId);
    const history = await this.projectHistory(envelope, siblings);

    return this.toTask(envelope, history, true);
  }

  async list(
    params: ListTasksRequest,
    context: ServerCallContext,
  ): Promise<ListTasksResponse> {
    const userId = this.ownerOf(context);

    let envelopes = params.contextId
      ? await this.envelopesOf(userId, params.contextId)
      : await this.allEnvelopes(userId);

    if (
      params.status !== undefined &&
      params.status !== TaskState.TASK_STATE_UNSPECIFIED
    ) {
      const wanted = taskStateToJSON(params.status);
      envelopes = envelopes.filter((e) => e.state === wanted);
    }

    if (params.statusTimestampAfter) {
      const after = new Date(params.statusTimestampAfter).getTime();
      envelopes = envelopes.filter(
        (e) =>
          !e.statusTimestamp || new Date(e.statusTimestamp).getTime() >= after,
      );
    }

    envelopes.sort((a, b) => a.historyStart - b.historyStart);

    const totalSize = envelopes.length;
    const pageSize = Math.min(
      Math.max(params.pageSize ?? DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE,
    );
    const offset = params.pageToken ? Number(params.pageToken) || 0 : 0;
    const page = envelopes.slice(offset, offset + pageSize);

    const byContext = new Map<string, TaskEnvelope[]>();
    for (const envelope of envelopes) {
      const bucket = byContext.get(envelope.contextId);
      if (bucket) bucket.push(envelope);
      else byContext.set(envelope.contextId, [envelope]);
    }

    const tasks: Task[] = [];
    for (const envelope of page) {
      const history = await this.projectHistory(
        envelope,
        byContext.get(envelope.contextId) ?? [envelope],
        params.historyLength,
      );
      tasks.push(
        this.toTask(envelope, history, params.includeArtifacts === true),
      );
    }

    const nextOffset = offset + page.length;

    return {
      tasks,
      nextPageToken: nextOffset < totalSize ? String(nextOffset) : '',
      pageSize,
      totalSize,
    };
  }

  private async readEnvelope(
    taskId: string,
    userId: string | null,
  ): Promise<TaskEnvelope | undefined> {
    const pointer = await this.store.get(this.indexNamespace(userId), taskId);
    const contextId = (pointer?.value as { contextId?: string } | undefined)
      ?.contextId;
    if (!contextId) return undefined;

    const item = await this.store.get(
      this.tasksNamespace(userId, contextId),
      taskId,
    );
    return (item?.value as TaskEnvelope | undefined) ?? undefined;
  }

  private async searchExact(namespace: string[]): Promise<TaskEnvelope[]> {
    const items = await this.store.search(namespace);
    return items
      .filter((item) => startsWith(item.namespace, namespace))
      .map((item) => item.value as unknown as TaskEnvelope);
  }

  private async envelopesOf(
    userId: string | null,
    contextId: string,
  ): Promise<TaskEnvelope[]> {
    return this.searchExact(this.tasksNamespace(userId, contextId));
  }

  private async allEnvelopes(userId: string | null): Promise<TaskEnvelope[]> {
    return this.searchExact(['a2a', userId ?? '_anon', 'tasks']);
  }

  private async readMessages(
    contextId: string,
    owner: string | null,
  ): Promise<BaseMessage[]> {
    const tuple = await this.checkpointer.getTuple({
      configurable: { thread_id: contextId, actor_id: owner ?? '_anon' },
    });
    const messages = tuple?.checkpoint?.channel_values?.messages;
    return Array.isArray(messages) ? (messages as BaseMessage[]) : [];
  }

  private async announcementWatermark(
    task: Task,
    owner: string | null,
  ): Promise<number> {
    const raw = await this.readMessages(task.contextId, owner);

    const opensWith = task.history?.[0]?.messageId;
    if (opensWith) {
      const index = raw.findIndex((message) => message.id === opensWith);
      if (index >= 0) return index;
    }

    return raw.length;
  }

  private async projectHistory(
    envelope: TaskEnvelope,
    siblings: TaskEnvelope[],
    historyLength?: number,
  ): Promise<Message[]> {
    if (historyLength === 0) return [];

    const messages = await this.readMessages(
      envelope.contextId,
      envelope.userId,
    );

    const nextStart = siblings
      .map((sibling) => sibling.historyStart)
      .filter((start) => start > envelope.historyStart)
      .sort((a, b) => a - b)[0];

    const folded = foldLangChainMessages(messages, envelope.contextId).filter(
      (message) =>
        message.seq > envelope.historyStart &&
        (nextStart === undefined || message.seq <= nextStart),
    );

    const windowed =
      historyLength && historyLength > 0
        ? folded.slice(-historyLength)
        : folded;

    return windowed.map((message) => ({
      messageId: message.id,
      contextId: envelope.contextId,
      taskId: envelope.taskId,
      role: message.role === 'USER' ? Role.ROLE_USER : Role.ROLE_AGENT,
      parts: this.encoder.encode(toParts(message.source)),
      metadata: undefined,
      extensions: [],
      referenceTaskIds: [],
    }));
  }

  private toTask(
    envelope: TaskEnvelope,
    history: Message[],
    includeArtifactParts: boolean,
  ): Task {
    const agentParts = includeArtifactParts
      ? history
          .filter((message) => message.role === Role.ROLE_AGENT)
          .flatMap((message) => message.parts)
      : [];

    return {
      id: envelope.taskId,
      contextId: envelope.contextId,
      status: {
        state: taskStateFromJSON(envelope.state),
        message: envelope.statusMessage,
        timestamp: envelope.statusTimestamp,
      },
      artifacts: envelope.artifacts.map((entry, position) => ({
        ...entry,
        parts: position === 0 ? agentParts : [],
      })),
      history,
      metadata: envelope.metadata,
    };
  }
}

function startsWith(
  path: readonly string[],
  prefix: readonly string[],
): boolean {
  return (
    path.length >= prefix.length &&
    prefix.every((segment, index) => path[index] === segment)
  );
}

function stripHistory(message: Message): Message {
  return { ...message, referenceTaskIds: [] };
}
