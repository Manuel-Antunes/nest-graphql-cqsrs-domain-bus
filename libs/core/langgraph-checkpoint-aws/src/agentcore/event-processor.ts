import {
  AIMessage,
  type BaseMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import {
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointPendingWrite,
  type CheckpointTuple,
  isDeltaSnapshot,
} from '@langchain/langgraph-checkpoint';

import { EMPTY_CHANNEL_VALUE } from './constants';
import type {
  CheckpointEvent,
  CheckpointerConfig,
  CheckpointStorageEvent,
  WriteItem,
} from './models';

/** A session's events, sorted into what a checkpoint tuple is built from. */
export interface ProcessedEvents {
  readonly checkpoints: Map<string, CheckpointEvent>;
  readonly writesByCheckpoint: Map<string, WriteItem[]>;
  readonly channelData: Map<string, unknown>;
}

/** Builds checkpoint tuples out of the events a session holds. */
export class EventProcessor {
  /** The channel versions the checkpoint references whose values were not read. */
  static missingChannelVersions(
    checkpoint: CheckpointEvent,
    events: readonly CheckpointStorageEvent[],
  ): Set<string> {
    const present = new Set(
      events.flatMap((event) =>
        event.event_type === 'channel_data'
          ? [EventProcessor.channelKey(event.channel, event.version)]
          : [],
      ),
    );
    return new Set(
      Object.entries(EventProcessor.versionsOf(checkpoint))
        .map(([channel, version]) =>
          EventProcessor.channelKey(channel, String(version)),
        )
        .filter((key) => !present.has(key)),
    );
  }

  static processEvents(
    events: readonly CheckpointStorageEvent[],
  ): ProcessedEvents {
    const checkpoints = new Map<string, CheckpointEvent>();
    const writesByCheckpoint = new Map<string, WriteItem[]>();
    const channelData = new Map<string, unknown>();
    for (const event of events) {
      switch (event.event_type) {
        case 'checkpoint':
          checkpoints.set(event.checkpoint_id, event);
          break;
        case 'writes':
          writesByCheckpoint.set(event.checkpoint_id, [
            ...(writesByCheckpoint.get(event.checkpoint_id) ?? []),
            ...event.writes,
          ]);
          break;
        case 'channel_data':
          if (event.value !== EMPTY_CHANNEL_VALUE) {
            channelData.set(
              EventProcessor.channelKey(event.channel, event.version),
              event.value,
            );
          }
          break;
      }
    }
    return { checkpoints, writesByCheckpoint, channelData };
  }

  static buildCheckpointTuple(
    checkpointEvent: CheckpointEvent,
    writes: readonly WriteItem[],
    channelData: ReadonlyMap<string, unknown>,
    config: CheckpointerConfig,
    patchOrphanToolCalls = true,
  ): CheckpointTuple {
    const pendingWrites: CheckpointPendingWrite[] = writes.map((write) => [
      write.task_id,
      write.channel,
      write.value,
    ]);
    const hasInterrupts = pendingWrites.some(
      ([, channel, value]) => channel === '__interrupt__' && Boolean(value),
    );
    const channelValues: Record<string, unknown> = {};
    for (const [channel, version] of Object.entries(
      EventProcessor.versionsOf(checkpointEvent),
    )) {
      const key = EventProcessor.channelKey(channel, String(version));
      if (channelData.has(key)) channelValues[channel] = channelData.get(key);
    }
    if ('messages' in channelValues && patchOrphanToolCalls && !hasInterrupts) {
      channelValues.messages = EventProcessor.patchOrphanToolCalls(
        channelValues.messages,
      );
    }
    return {
      config: EventProcessor.configOf(config, checkpointEvent.checkpoint_id),
      checkpoint: {
        ...checkpointEvent.checkpoint_data,
        channel_values: channelValues,
      } as unknown as Checkpoint,
      metadata: checkpointEvent.metadata as CheckpointMetadata,
      parentConfig: checkpointEvent.parent_checkpoint_id
        ? EventProcessor.configOf(config, checkpointEvent.parent_checkpoint_id)
        : undefined,
      pendingWrites,
    };
  }

  /**
   * Adds an error `ToolMessage` after every tool call that has no answer — a checkpoint saved in
   * the middle of a tool's execution leaves one, and Bedrock refuses a conversation that has it. A
   * delta snapshot is returned as it is: it is an incomplete seed whose writes are replayed later.
   */
  static patchOrphanToolCalls(messages: unknown): unknown {
    if (isDeltaSnapshot(messages) || !Array.isArray(messages)) return messages;
    const patched: BaseMessage[] = [];
    for (const [index, message] of (messages as BaseMessage[]).entries()) {
      patched.push(message);
      if (!AIMessage.isInstance(message) || !message.tool_calls?.length) {
        continue;
      }
      for (const call of message.tool_calls) {
        const answered = (messages as BaseMessage[])
          .slice(index + 1)
          .some(
            (later) =>
              ToolMessage.isInstance(later) && later.tool_call_id === call.id,
          );
        if (answered) continue;
        const name = call.name ?? 'unknown';
        patched.push(
          new ToolMessage({
            content: `Tool call '${name}' with id '${call.id}' was interrupted before completion.`,
            name,
            tool_call_id: call.id ?? '',
            status: 'error',
            additional_kwargs: { orphan_tool_call_placeholder: true },
          }),
        );
      }
    }
    return patched;
  }

  static channelKey(channel: string, version: string): string {
    return JSON.stringify([channel, version]);
  }

  private static versionsOf(
    checkpoint: CheckpointEvent,
  ): Record<string, string | number> {
    return (
      (checkpoint.checkpoint_data.channel_versions as
        | Record<string, string | number>
        | undefined) ?? {}
    );
  }

  private static configOf(
    config: CheckpointerConfig,
    checkpointId: string,
  ): RunnableConfig {
    return {
      configurable: {
        thread_id: config.threadId,
        actor_id: config.actorId,
        checkpoint_ns: config.checkpointNs,
        checkpoint_id: checkpointId,
      },
    };
  }
}
