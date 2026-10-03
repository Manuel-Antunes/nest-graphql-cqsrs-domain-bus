import type { RunnableConfig } from '@langchain/core/runnables';
import {
  BaseCheckpointSaver,
  type ChannelVersions,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  getCheckpointId,
  type PendingWrite,
  type SerializerProtocol,
} from '@langchain/langgraph-checkpoint';

import {
  AgentCoreEventClient,
  type AgentCoreEventClientOptions,
} from './agentcore-event-client';
import { AgentCoreSnapshotClient } from './agentcore-snapshot-client';
import {
  CheckpointReadLimitError,
  EMPTY_CHANNEL_VALUE,
  EventNotFoundError,
  InvalidConfigError,
} from './constants';
import { EventProcessor } from './event-processor';
import { EventSerializer } from './event-serializer';
import {
  type ChannelDataEvent,
  type CheckpointEvent,
  CheckpointerConfig,
  type CheckpointStorageEvent,
  type WriteItem,
  type WritesEvent,
} from './models';

/** How checkpoints are laid out in the session. */
export type CheckpointFormat = 'legacy' | 'snapshot';

/** The writes of one task, persisted together with the checkpoint they follow. */
export interface TaskWrites {
  readonly taskId: string;
  readonly writes: readonly PendingWrite[];
  readonly taskPath?: string;
}

export interface AgentCoreMemorySaverOptions
  extends AgentCoreEventClientOptions {
  readonly serde?: SerializerProtocol;
  /**
   * The most decoded blobs a `getTuple` reads across all pages — not a checkpoint count. Unset
   * reads the whole session. A capped read that lacks the checkpoint or a channel it references
   * throws `CheckpointReadLimitError`; otherwise it returns with a warning. Snapshot mode requires
   * it unset.
   */
  readonly limit?: number;
  /** Events per `ListEvents` page, 1 to 100. */
  readonly maxResults?: number;
  /**
   * `legacy` keeps every checkpoint as a set of events, read by scanning the session; `snapshot`
   * stores each checkpoint complete, so the latest one loads in two `ListEvents` calls. Every
   * process reading a snapshot thread must use `snapshot`, and once a thread has one there is no
   * going back.
   */
  readonly checkpointFormat?: CheckpointFormat;
  /**
   * Answers, on every read, each tool call the checkpoint holds no result for with an error
   * `ToolMessage` — Python's `patch_orphan_tool_calls`, and the default. Turn it off for an agent
   * whose runs end at a call the client answers in the next run (a client tool, CopilotKit's
   * frontend tools): the patch answers that call first, and the client's result becomes a second
   * answer to the same call, which Bedrock refuses.
   */
  readonly patchOrphanToolCalls?: boolean;
}

/**
 * A LangGraph checkpointer on Amazon Bedrock AgentCore Memory: every checkpoint, channel value and
 * pending write is a blob of an event in the session `thread_id` (hashed with `checkpoint_ns` when
 * there is one) of the actor `actor_id`. Both are required in `configurable`.
 *
 * A TypeScript port of `AgentCoreMemorySaver` from `langgraph-checkpoint-aws` — see this library's
 * NOTICE.md.
 */
export class AgentCoreMemorySaver extends BaseCheckpointSaver {
  readonly limit?: number;
  readonly maxResults?: number;
  readonly checkpointFormat: CheckpointFormat;
  readonly patchOrphanToolCalls: boolean;
  readonly events: AgentCoreEventClient;

  constructor(
    readonly memoryId: string,
    options: AgentCoreMemorySaverOptions = {},
  ) {
    super(options.serde);
    const { limit, maxResults = 100, checkpointFormat = 'legacy' } = options;
    if (checkpointFormat === 'snapshot' && limit !== undefined) {
      throw new InvalidConfigError(
        "checkpointFormat 'snapshot' requires limit to be unset: snapshot reads retrieve the complete snapshot and its writes.",
      );
    }
    if (limit !== undefined && limit <= 0) {
      throw new InvalidConfigError(
        'limit must be a positive integer, or unset.',
      );
    }
    if (maxResults !== undefined && (maxResults < 1 || maxResults > 100)) {
      throw new InvalidConfigError('maxResults must be between 1 and 100.');
    }
    this.limit = limit;
    this.maxResults = maxResults;
    this.checkpointFormat = checkpointFormat;
    this.patchOrphanToolCalls = options.patchOrphanToolCalls ?? true;
    const serializer = new EventSerializer(this.serde);
    this.events =
      checkpointFormat === 'snapshot'
        ? new AgentCoreSnapshotClient(memoryId, serializer, options)
        : new AgentCoreEventClient(memoryId, serializer, options);
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const where = CheckpointerConfig.fromRunnableConfig(config);
    let events: CheckpointStorageEvent[] | undefined;
    let truncated = false;
    if (this.events instanceof AgentCoreSnapshotClient) {
      events = await this.events.getSnapshot(
        where.sessionId,
        where.actorId,
        where.checkpointId,
        this.maxResults,
      );
    }
    if (events === undefined) {
      const read = await this.events.readEvents(
        where.sessionId,
        where.actorId,
        this.limit,
        this.maxResults,
      );
      events = read.events;
      truncated = read.truncated;
    }
    const { checkpoints, writesByCheckpoint, channelData } =
      EventProcessor.processEvents(events);
    const checkpoint = where.checkpointId
      ? checkpoints.get(where.checkpointId)
      : AgentCoreMemorySaver.latestOf(checkpoints);
    if (!checkpoint) {
      if (truncated) {
        throw new CheckpointReadLimitError(
          `Checkpoint read truncated by limit=${this.limit} before the requested checkpoint record was found. Increase limit or leave it unset. No checkpoint was returned.`,
        );
      }
      return undefined;
    }
    this.checkReadFormat(checkpoint);
    const missing = EventProcessor.missingChannelVersions(checkpoint, events);
    if (missing.size > 0) {
      const message = `Checkpoint read is missing ${missing.size} referenced channel/version blob(s).`;
      if (truncated) {
        throw new CheckpointReadLimitError(
          `${message} History was truncated by limit=${this.limit}; increase limit or leave it unset. No checkpoint was returned.`,
        );
      }
      throw new EventNotFoundError(
        `${message} Event history was exhausted. No checkpoint was returned.`,
      );
    }
    if (truncated) {
      process.emitWarning(
        `Checkpoint history was truncated by limit=${this.limit}. All referenced channel blobs for the selected checkpoint were retrieved, but pending writes may be incomplete.${where.checkpointId ? '' : ' A newer checkpoint may exist in unread history.'} Leave limit unset to read all history for recovery.`,
      );
    }
    const writes = [
      ...(writesByCheckpoint.get(checkpoint.checkpoint_id) ?? []),
    ];
    if (this.events instanceof AgentCoreSnapshotClient) {
      writes.push(
        ...(await this.events.getPendingWrites(
          where.threadId,
          where.actorId,
          checkpoint.checkpoint_id,
          this.maxResults,
          where.checkpointNs,
        )),
      );
    }
    return EventProcessor.buildCheckpointTuple(
      checkpoint,
      writes,
      channelData,
      where,
      this.patchOrphanToolCalls,
    );
  }

  async *list(
    config: RunnableConfig,
    options: CheckpointListOptions = {},
  ): AsyncGenerator<CheckpointTuple> {
    const { filter, before, limit } = options;
    const where = CheckpointerConfig.fromRunnableConfig(config);
    const onlyCheckpointId = getCheckpointId(config) || undefined;
    if (limit !== undefined && limit <= 0) return;
    const events = await this.events.getEvents(
      where.sessionId,
      where.actorId,
      undefined,
      this.maxResults,
    );
    const { checkpoints, writesByCheckpoint, channelData } =
      EventProcessor.processEvents(events);
    const beforeCheckpointId = before ? getCheckpointId(before) : undefined;
    let count = 0;
    for (const checkpointId of [...checkpoints.keys()].sort().reverse()) {
      const checkpoint = checkpoints.get(checkpointId) as CheckpointEvent;
      if (onlyCheckpointId && checkpointId !== onlyCheckpointId) continue;
      if (beforeCheckpointId && checkpointId >= beforeCheckpointId) continue;
      if (
        filter &&
        Object.entries(filter).some(
          ([key, value]) => checkpoint.metadata[key] !== value,
        )
      ) {
        continue;
      }
      if (limit !== undefined && count >= limit) break;
      this.checkReadFormat(checkpoint);
      const writes = [...(writesByCheckpoint.get(checkpointId) ?? [])];
      if (this.events instanceof AgentCoreSnapshotClient) {
        writes.push(
          ...(await this.events.getPendingWrites(
            where.threadId,
            where.actorId,
            checkpointId,
            this.maxResults,
            where.checkpointNs,
          )),
        );
      }
      yield EventProcessor.buildCheckpointTuple(
        checkpoint,
        writes,
        channelData,
        where,
        this.patchOrphanToolCalls,
      );
      count += 1;
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    return this.putWithWrites(config, checkpoint, metadata, newVersions, []);
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const where = CheckpointerConfig.fromRunnableConfig(config);
    if (!where.checkpointId) {
      throw new InvalidConfigError('checkpoint_id is required for putWrites');
    }
    const event: WritesEvent = {
      event_type: 'writes',
      checkpoint_id: where.checkpointId,
      writes: AgentCoreMemorySaver.writeItemsOf({ taskId, writes }),
    };
    const sessionId =
      this.checkpointFormat === 'snapshot'
        ? AgentCoreSnapshotClient.writesSessionId(
            where.threadId,
            where.checkpointId,
            where.checkpointNs,
          )
        : where.sessionId;
    await this.events.storeBlobEvent(event, sessionId, where.actorId);
  }

  /** Persists a checkpoint and the writes buffered for it together. */
  async putWithWrites(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: ChannelVersions,
    pendingWrites: readonly TaskWrites[],
  ): Promise<RunnableConfig> {
    const where = CheckpointerConfig.fromRunnableConfig(config);
    const { channel_values: channelValues = {}, ...checkpointData } =
      checkpoint;
    const versions =
      this.checkpointFormat === 'snapshot'
        ? (checkpoint.channel_versions ?? {})
        : newVersions;
    const events: CheckpointStorageEvent[] = Object.entries(versions).map(
      ([channel, version]): ChannelDataEvent => ({
        event_type: 'channel_data',
        channel,
        version: String(version),
        value:
          channel in channelValues
            ? (channelValues as Record<string, unknown>)[channel]
            : EMPTY_CHANNEL_VALUE,
        thread_id: where.threadId,
        checkpoint_ns: where.checkpointNs,
      }),
    );
    events.push({
      event_type: 'checkpoint',
      checkpoint_id: checkpoint.id,
      checkpoint_data: checkpointData as Record<string, unknown>,
      metadata: metadata as Record<string, unknown>,
      parent_checkpoint_id: where.checkpointId ?? null,
      thread_id: where.threadId,
      checkpoint_ns: where.checkpointNs,
      chunk_event_ids: [],
    });
    for (const task of pendingWrites) {
      events.push({
        event_type: 'writes',
        checkpoint_id: checkpoint.id,
        writes: AgentCoreMemorySaver.writeItemsOf(task),
      });
    }
    if (this.events instanceof AgentCoreSnapshotClient) {
      await this.events.storeSnapshot(events, where.sessionId, where.actorId);
    } else {
      await this.events.storeBlobEventsBatch(
        events,
        where.sessionId,
        where.actorId,
      );
    }
    return {
      configurable: {
        thread_id: where.threadId,
        actor_id: where.actorId,
        checkpoint_ns: where.checkpointNs,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  /**
   * Deletes every checkpoint and write of the thread. An AgentCore session belongs to an actor,
   * so the actor is required — `BaseCheckpointSaver`'s signature has no room for it, hence the
   * second parameter.
   */
  async deleteThread(threadId: string, actorId?: string): Promise<void> {
    if (!actorId) {
      throw new InvalidConfigError(
        'Deleting a thread from AgentCore Memory needs the actor it belongs to.',
      );
    }
    await this.events.deleteEvents(threadId, actorId);
  }

  private checkReadFormat(checkpoint: CheckpointEvent): void {
    if (
      checkpoint.snapshot_version !== null &&
      checkpoint.snapshot_version !== undefined &&
      this.checkpointFormat !== 'snapshot'
    ) {
      throw new InvalidConfigError(
        "This checkpoint uses snapshot storage. Construct AgentCoreMemorySaver with checkpointFormat 'snapshot' to restore its pending writes.",
      );
    }
  }

  private static latestOf(
    checkpoints: ReadonlyMap<string, CheckpointEvent>,
  ): CheckpointEvent | undefined {
    const latest = [...checkpoints.keys()].sort().at(-1);
    return latest === undefined ? undefined : checkpoints.get(latest);
  }

  private static writeItemsOf({
    taskId,
    writes,
    taskPath = '',
  }: TaskWrites): WriteItem[] {
    return writes.map(([channel, value]) => ({
      task_id: taskId,
      channel,
      value,
      task_path: taskPath,
    }));
  }
}
