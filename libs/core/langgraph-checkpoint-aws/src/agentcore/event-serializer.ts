import type { SerializerProtocol } from '@langchain/langgraph-checkpoint';

import { EMPTY_CHANNEL_VALUE, EventDecodingError } from './constants';
import type { CheckpointStorageEvent, WriteItem } from './models';

/** A value as the serde typed it, its bytes in base64. */
export interface SerializedValue {
  readonly type: string;
  readonly data: string;
}

/**
 * Turns checkpoint events into the JSON strings stored as blobs, and back. Every value LangGraph
 * hands over — the checkpoint, its metadata, a channel's value, a write — goes through the serde,
 * so a message keeps its class across the round trip.
 */
export class EventSerializer {
  constructor(private readonly serde: SerializerProtocol) {}

  async serializeValue(value: unknown): Promise<SerializedValue> {
    const [type, bytes] = await this.serde.dumpsTyped(value);
    return { type, data: Buffer.from(bytes).toString('base64') };
  }

  async deserializeValue(serialized: SerializedValue): Promise<unknown> {
    try {
      return await this.serde.loadsTyped(
        serialized.type,
        new Uint8Array(Buffer.from(serialized.data, 'base64')),
      );
    } catch (error) {
      throw new EventDecodingError(
        `Failed to deserialize value: ${EventSerializer.messageOf(error)}`,
        { cause: error },
      );
    }
  }

  async serializeEvent(event: CheckpointStorageEvent): Promise<string> {
    const record: Record<string, unknown> = EventSerializer.withoutNulls(event);
    switch (event.event_type) {
      case 'checkpoint':
        record.checkpoint_data = await this.serializeValue(
          event.checkpoint_data,
        );
        record.metadata = await this.serializeValue(event.metadata);
        break;
      case 'channel_data':
        if (event.value !== EMPTY_CHANNEL_VALUE) {
          record.value = await this.serializeValue(event.value);
        }
        break;
      case 'writes':
        record.writes = await Promise.all(
          event.writes.map(async (write) => ({
            ...EventSerializer.withoutNulls(write),
            value: await this.serializeValue(write.value),
          })),
        );
        break;
    }
    return JSON.stringify(record);
  }

  async deserializeEvent(data: string): Promise<CheckpointStorageEvent> {
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(data) as Record<string, unknown>;
    } catch (error) {
      throw new EventDecodingError(
        `Failed to parse JSON: ${EventSerializer.messageOf(error)}`,
        { cause: error },
      );
    }
    try {
      switch (record.event_type) {
        case 'checkpoint':
          return {
            event_type: 'checkpoint',
            checkpoint_id: String(record.checkpoint_id),
            checkpoint_data: (await this.deserializeValue(
              record.checkpoint_data as SerializedValue,
            )) as Record<string, unknown>,
            metadata: (await this.deserializeValue(
              record.metadata as SerializedValue,
            )) as Record<string, unknown>,
            parent_checkpoint_id:
              (record.parent_checkpoint_id as string | undefined) ?? null,
            thread_id: String(record.thread_id),
            checkpoint_ns: (record.checkpoint_ns as string | undefined) ?? '',
            snapshot_version:
              (record.snapshot_version as number | undefined) ?? null,
            chunk_event_ids:
              (record.chunk_event_ids as string[] | undefined) ?? [],
          };
        case 'channel_data':
          return {
            event_type: 'channel_data',
            channel: String(record.channel),
            version: String(record.version),
            value: EventSerializer.isSerialized(record.value)
              ? await this.deserializeValue(record.value)
              : record.value,
            thread_id: String(record.thread_id),
            checkpoint_ns: (record.checkpoint_ns as string | undefined) ?? '',
          };
        case 'writes':
          return {
            event_type: 'writes',
            checkpoint_id: String(record.checkpoint_id),
            writes: await Promise.all(
              (record.writes as Record<string, unknown>[]).map(
                async (write): Promise<WriteItem> => ({
                  task_id: String(write.task_id),
                  channel: String(write.channel),
                  task_path: (write.task_path as string | undefined) ?? '',
                  value: EventSerializer.isSerialized(write.value)
                    ? await this.deserializeValue(write.value)
                    : write.value,
                }),
              ),
            ),
          };
        default:
          throw new EventDecodingError(
            `Unknown event type: ${String(record.event_type)}`,
          );
      }
    } catch (error) {
      if (error instanceof EventDecodingError) throw error;
      throw new EventDecodingError(
        `Failed to deserialize event: ${EventSerializer.messageOf(error)}`,
        { cause: error },
      );
    }
  }

  private static isSerialized(value: unknown): value is SerializedValue {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      typeof (value as SerializedValue).type === 'string' &&
      typeof (value as SerializedValue).data === 'string'
    );
  }

  private static withoutNulls(value: object): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, entry]) => entry !== null && entry !== undefined,
      ),
    );
  }

  private static messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
