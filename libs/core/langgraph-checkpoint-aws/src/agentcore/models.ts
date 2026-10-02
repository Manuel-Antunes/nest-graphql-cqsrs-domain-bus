import { createHash } from 'node:crypto';
import type { RunnableConfig } from '@langchain/core/runnables';

import { InvalidConfigError } from './constants';

/** One write of a task, as stored in a {@link WritesEvent}. */
export interface WriteItem {
  readonly task_id: string;
  readonly channel: string;
  readonly value: unknown;
  readonly task_path: string;
}

/** A checkpoint, without its channel values, which travel as {@link ChannelDataEvent}s. */
export interface CheckpointEvent {
  readonly event_type: 'checkpoint';
  readonly checkpoint_id: string;
  readonly checkpoint_data: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
  readonly parent_checkpoint_id?: string | null;
  readonly thread_id: string;
  readonly checkpoint_ns: string;
  readonly snapshot_version?: number | null;
  readonly chunk_event_ids: string[];
}

/** The value of one channel at one version. */
export interface ChannelDataEvent {
  readonly event_type: 'channel_data';
  readonly channel: string;
  readonly version: string;
  readonly value: unknown;
  readonly thread_id: string;
  readonly checkpoint_ns: string;
}

/** The pending writes of a checkpoint. */
export interface WritesEvent {
  readonly event_type: 'writes';
  readonly checkpoint_id: string;
  readonly writes: WriteItem[];
}

/** Everything the checkpointer stores as a blob of an AgentCore Memory event. */
export type CheckpointStorageEvent =
  | CheckpointEvent
  | ChannelDataEvent
  | WritesEvent;

/**
 * Where a checkpoint lives in AgentCore Memory: the thread is the session (hashed with its
 * namespace when it has one, to stay under the 100 characters a session id may have) and
 * `actor_id` is the actor.
 */
export class CheckpointerConfig {
  constructor(
    readonly threadId: string,
    readonly actorId: string,
    readonly checkpointNs: string = '',
    readonly checkpointId?: string,
  ) {}

  get sessionId(): string {
    if (!this.checkpointNs) return this.threadId;
    return createHash('sha256')
      .update(`${this.threadId}_${this.checkpointNs}`)
      .digest('hex');
  }

  static fromRunnableConfig(config: RunnableConfig): CheckpointerConfig {
    const configurable = config.configurable ?? {};
    if (!configurable.thread_id) {
      throw new InvalidConfigError(
        "RunnableConfig must contain 'thread_id' for AgentCore Checkpointer",
      );
    }
    if (!configurable.actor_id) {
      throw new InvalidConfigError(
        "RunnableConfig must contain 'actor_id' for AgentCore Checkpointer",
      );
    }
    return new CheckpointerConfig(
      String(configurable.thread_id),
      String(configurable.actor_id),
      configurable.checkpoint_ns ? String(configurable.checkpoint_ns) : '',
      configurable.checkpoint_id
        ? String(configurable.checkpoint_id)
        : undefined,
    );
  }
}
