import { createHash } from 'node:crypto';
import {
  type CreateEventCommandOutput,
  type Event,
  type EventMetadataFilterExpression,
  GetEventCommand,
  ListEventsCommand,
  type ListEventsCommandInput,
  ListSessionsCommand,
  type ListSessionsCommandInput,
  type MetadataValue,
} from '@aws-sdk/client-bedrock-agentcore';
import { uuid5 } from '@langchain/langgraph-checkpoint';

import { AgentCoreEventClient } from './agentcore-event-client';
import { EventDecodingError, EventNotFoundError } from './constants';
import type {
  CheckpointEvent,
  CheckpointStorageEvent,
  WriteItem,
} from './models';

type SnapshotKind = 'checkpoint' | 'checkpoint_data';

/**
 * Stores each checkpoint as a complete snapshot — its own event, metadata naming it, with any
 * data that does not fit in it in chunk events it references — so the latest checkpoint loads in
 * two `ListEvents` calls however long the thread is. Pending writes go to a session of their own
 * per checkpoint.
 */
export class AgentCoreSnapshotClient extends AgentCoreEventClient {
  static readonly SNAPSHOT_VERSION = 1;
  static readonly SNAPSHOT_LAYOUT = 'snapshot-v1';
  static readonly SNAPSHOT_PAYLOAD_BYTES =
    AgentCoreEventClient.MAX_PAYLOAD_BYTES_PER_EVENT - 4096;
  private static readonly NAMESPACE_OID =
    '6ba7b812-9dad-11d1-80b4-00c04fd430c8';

  /** The session that holds the pending writes of one checkpoint of the thread. */
  static writesSessionId(
    threadId: string,
    checkpointId: string,
    checkpointNs = '',
  ): string {
    const key = AgentCoreSnapshotClient.sha256(
      `${checkpointNs}\x1f${checkpointId}`,
    );
    return (
      AgentCoreSnapshotClient.writesSessionPrefix(threadId) + key.slice(0, 32)
    );
  }

  async storeSnapshot(
    events: readonly CheckpointStorageEvent[],
    sessionId: string,
    actorId: string,
  ): Promise<void> {
    const original = events.find(
      (event): event is CheckpointEvent => event.event_type === 'checkpoint',
    );
    if (!original) {
      throw new Error('A snapshot needs its checkpoint event.');
    }
    const checkpoint: CheckpointEvent = {
      ...original,
      snapshot_version: AgentCoreSnapshotClient.SNAPSHOT_VERSION,
      chunk_event_ids: [],
    };
    const payload = await Promise.all(
      events
        .filter((event) => event.event_type !== 'checkpoint')
        .map((event) => this.blobPayload(event)),
    );
    payload.push(await this.blobPayload(checkpoint));
    if (
      payload.some(
        (item) =>
          Buffer.byteLength(item, 'utf8') >
          AgentCoreSnapshotClient.SNAPSHOT_PAYLOAD_BYTES,
      )
    ) {
      throw new Error(
        'A snapshot payload item exceeds the AgentCore event size limit.',
      );
    }
    const chunks = AgentCoreEventClient.chunkPayload(
      payload,
      AgentCoreEventClient.MAX_PAYLOAD_ITEMS_PER_EVENT,
      AgentCoreSnapshotClient.SNAPSHOT_PAYLOAD_BYTES,
    );
    const eventIds: string[] = [];
    for (const [index, chunk] of chunks.slice(0, -1).entries()) {
      const response = await this.createSnapshotEvent(
        chunk,
        sessionId,
        actorId,
        checkpoint,
        'checkpoint_data',
        chunks.length + 1 - index,
      );
      eventIds.push(String(response.event?.eventId));
    }
    let finalChunk = [...(chunks.at(-1) ?? [])];
    let committed: CheckpointEvent = {
      ...checkpoint,
      chunk_event_ids: eventIds,
    };
    finalChunk[finalChunk.length - 1] = await this.blobPayload(committed);
    if (
      finalChunk.reduce(
        (size, item) => size + Buffer.byteLength(item, 'utf8'),
        0,
      ) > AgentCoreSnapshotClient.SNAPSHOT_PAYLOAD_BYTES
    ) {
      if (finalChunk.length > 1) {
        const response = await this.createSnapshotEvent(
          finalChunk.slice(0, -1),
          sessionId,
          actorId,
          committed,
          'checkpoint_data',
          1,
        );
        committed = {
          ...committed,
          chunk_event_ids: [...eventIds, String(response.event?.eventId)],
        };
      }
      finalChunk = [await this.blobPayload(committed)];
      if (
        Buffer.byteLength(finalChunk[0], 'utf8') >
        AgentCoreSnapshotClient.SNAPSHOT_PAYLOAD_BYTES
      ) {
        throw new Error(
          "The snapshot's checkpoint record exceeds the event size limit.",
        );
      }
    }
    await this.createSnapshotEvent(
      finalChunk,
      sessionId,
      actorId,
      committed,
      'checkpoint',
    );
  }

  /**
   * The events of the requested snapshot — or of the latest one — with the legacy pending writes
   * read on the way; `undefined` asks for a legacy scan of the session.
   */
  async getSnapshot(
    sessionId: string,
    actorId: string,
    checkpointId: string | undefined,
    maxResults: number | undefined,
  ): Promise<CheckpointStorageEvent[] | undefined> {
    const commitFilter = AgentCoreSnapshotClient.metadataEquals(
      'lc_kind',
      'checkpoint',
    );
    const params: ListEventsCommandInput = {
      memoryId: this.memoryId,
      actorId,
      sessionId,
      includePayloads: true,
      maxResults: checkpointId ? (maxResults ?? 100) : 1,
      ...(checkpointId
        ? {
            filter: {
              eventMetadata: [
                AgentCoreSnapshotClient.metadataEquals(
                  'lc_checkpoint_id',
                  AgentCoreSnapshotClient.checkpointKey(checkpointId),
                ),
                commitFilter,
              ],
            },
          }
        : {}),
    };
    const legacyWrites: CheckpointStorageEvent[] = [];
    let legacyBlobsSeen = false;
    for (;;) {
      const response = await this.client.send(new ListEventsCommand(params));
      for (const event of response.events ?? []) {
        const metadata = event.metadata ?? {};
        if (
          metadata.lc_layout?.stringValue !==
          AgentCoreSnapshotClient.SNAPSHOT_LAYOUT
        ) {
          for (const item of event.payload ?? []) {
            if (typeof item.blob !== 'string') continue;
            legacyBlobsSeen = true;
            let decoded: CheckpointStorageEvent;
            try {
              decoded = await this.serializer.deserializeEvent(item.blob);
            } catch (error) {
              if (!(error instanceof EventDecodingError)) throw error;
              process.emitWarning(`Failed to decode event: ${error.message}`);
              continue;
            }
            if (decoded.event_type === 'checkpoint') return undefined;
            if (decoded.event_type === 'writes') legacyWrites.push(decoded);
          }
          continue;
        }
        if (metadata.lc_kind?.stringValue === 'checkpoint') {
          return [
            ...legacyWrites,
            ...(await this.loadSnapshot(event, sessionId, actorId)),
          ];
        }
      }
      if (!response.nextToken) {
        return checkpointId || params.filter ? undefined : [];
      }
      if (checkpointId) {
        params.nextToken = response.nextToken;
        params.maxResults = maxResults ?? 100;
      } else if (!params.filter && !legacyBlobsSeen) {
        params.filter = { eventMetadata: [commitFilter] };
        params.maxResults = maxResults ?? 100;
      } else {
        params.nextToken = response.nextToken;
      }
    }
  }

  /** Every pending write of the checkpoint, whatever order they were written in. */
  async getPendingWrites(
    threadId: string,
    actorId: string,
    checkpointId: string,
    maxResults: number | undefined = 100,
    checkpointNs = '',
  ): Promise<WriteItem[]> {
    const params: ListEventsCommandInput = {
      memoryId: this.memoryId,
      sessionId: AgentCoreSnapshotClient.writesSessionId(
        threadId,
        checkpointId,
        checkpointNs,
      ),
      actorId,
      includePayloads: true,
      ...(maxResults !== undefined ? { maxResults } : {}),
    };
    const writes: WriteItem[] = [];
    for (;;) {
      const response = await this.client.send(new ListEventsCommand(params));
      for (const raw of response.events ?? []) {
        for (const event of await this.decodePayload(raw)) {
          if (event.event_type !== 'writes') {
            throw new EventDecodingError(
              "Unexpected event in a checkpoint's pending-write session.",
            );
          }
          if (event.checkpoint_id !== checkpointId) {
            throw new EventDecodingError(
              'Pending writes belong to a different checkpoint.',
            );
          }
          writes.push(...event.writes);
        }
      }
      if (!response.nextToken) return writes;
      params.nextToken = response.nextToken;
    }
  }

  /** Deletes the thread's session and every pending-write session of it, orphans included. */
  override async deleteEvents(
    sessionId: string,
    actorId: string,
  ): Promise<void> {
    const prefix = AgentCoreSnapshotClient.writesSessionPrefix(sessionId);
    const params: ListSessionsCommandInput = {
      memoryId: this.memoryId,
      actorId,
      maxResults: 100,
    };
    const sessions: string[] = [];
    for (;;) {
      const response = await this.client.send(new ListSessionsCommand(params));
      sessions.push(
        ...(response.sessionSummaries ?? [])
          .map((summary) => String(summary.sessionId))
          .filter((id) => id.startsWith(prefix)),
      );
      if (!response.nextToken) break;
      params.nextToken = response.nextToken;
    }
    for (const writesSession of sessions) {
      await super.deleteEvents(writesSession, actorId);
    }
    await super.deleteEvents(sessionId, actorId);
  }

  private async loadSnapshot(
    event: Event,
    sessionId: string,
    actorId: string,
  ): Promise<CheckpointStorageEvent[]> {
    const events = await this.decodePayload(event);
    const checkpoints = events.filter(
      (decoded): decoded is CheckpointEvent =>
        decoded.event_type === 'checkpoint',
    );
    if (
      checkpoints.length !== 1 ||
      checkpoints[0].snapshot_version !==
        AgentCoreSnapshotClient.SNAPSHOT_VERSION
    ) {
      throw new EventDecodingError(
        'Invalid or unsupported AgentCore checkpoint snapshot.',
      );
    }
    const [checkpoint] = checkpoints;
    if (
      !AgentCoreSnapshotClient.carries(
        event,
        AgentCoreSnapshotClient.metadataOf(
          checkpoint.checkpoint_id,
          'checkpoint',
        ),
      )
    ) {
      throw new EventDecodingError(
        'Checkpoint metadata does not match the snapshot payload.',
      );
    }
    const chunkMetadata = AgentCoreSnapshotClient.metadataOf(
      checkpoint.checkpoint_id,
      'checkpoint_data',
    );
    for (const eventId of checkpoint.chunk_event_ids) {
      const response = await this.client.send(
        new GetEventCommand({
          memoryId: this.memoryId,
          actorId,
          sessionId,
          eventId,
        }),
      );
      const chunk = response.event;
      if (!chunk || !AgentCoreSnapshotClient.carries(chunk, chunkMetadata)) {
        throw new EventDecodingError(
          `Unexpected metadata for checkpoint chunk ${eventId}.`,
        );
      }
      const chunkEvents = await this.decodePayload(chunk);
      if (chunkEvents.some((decoded) => decoded.event_type === 'checkpoint')) {
        throw new EventDecodingError(
          `Unexpected checkpoint in data chunk ${eventId}.`,
        );
      }
      events.push(...chunkEvents);
    }
    const actual = new Set(
      events.flatMap((decoded) =>
        decoded.event_type === 'channel_data'
          ? [JSON.stringify([decoded.channel, decoded.version])]
          : [],
      ),
    );
    const versions =
      (checkpoint.checkpoint_data.channel_versions as
        | Record<string, string | number>
        | undefined) ?? {};
    if (
      Object.entries(versions).some(
        ([channel, version]) =>
          !actual.has(JSON.stringify([channel, String(version)])),
      )
    ) {
      throw new EventNotFoundError(
        `Missing channel data for checkpoint ${checkpoint.checkpoint_id}.`,
      );
    }
    return events;
  }

  private async createSnapshotEvent(
    payload: readonly string[],
    sessionId: string,
    actorId: string,
    checkpoint: CheckpointEvent,
    kind: SnapshotKind,
    offsetMs = 0,
  ): Promise<CreateEventCommandOutput> {
    const digest = createHash('sha256');
    for (const part of [
      sessionId,
      actorId,
      checkpoint.checkpoint_id,
      kind,
      ...payload,
    ]) {
      digest.update(part);
      digest.update('\x1f');
    }
    return this.createEvent({
      memoryId: this.memoryId,
      actorId,
      sessionId,
      eventTimestamp: new Date(
        AgentCoreSnapshotClient.timestampOf(checkpoint).getTime() - offsetMs,
      ),
      clientToken: uuid5(
        digest.digest('hex'),
        AgentCoreSnapshotClient.NAMESPACE_OID,
      ),
      metadata: AgentCoreSnapshotClient.metadataOf(
        checkpoint.checkpoint_id,
        kind,
      ),
      payload: payload.map((item) => JSON.parse(item)),
    });
  }

  private async blobPayload(event: CheckpointStorageEvent): Promise<string> {
    return JSON.stringify({
      blob: await this.serializer.serializeEvent(event),
    });
  }

  private async decodePayload(event: Event): Promise<CheckpointStorageEvent[]> {
    return Promise.all(
      (event.payload ?? [])
        .filter((item) => typeof item.blob === 'string')
        .map((item) => this.serializer.deserializeEvent(item.blob as string)),
    );
  }

  private static metadataOf(
    checkpointId: string,
    kind: SnapshotKind,
  ): Record<string, MetadataValue> {
    return {
      lc_layout: { stringValue: AgentCoreSnapshotClient.SNAPSHOT_LAYOUT },
      lc_kind: { stringValue: kind },
      lc_checkpoint_id: {
        stringValue: AgentCoreSnapshotClient.checkpointKey(checkpointId),
      },
    };
  }

  private static carries(
    event: Event,
    expected: Record<string, MetadataValue>,
  ): boolean {
    return Object.entries(expected).every(
      ([key, value]) =>
        event.metadata?.[key]?.stringValue === value.stringValue,
    );
  }

  private static metadataEquals(
    key: string,
    value: string,
  ): EventMetadataFilterExpression {
    return {
      left: { metadataKey: key },
      operator: 'EQUALS_TO',
      right: { metadataValue: { stringValue: value } },
    };
  }

  private static timestampOf(checkpoint: CheckpointEvent): Date {
    const ts = checkpoint.checkpoint_data.ts;
    if (typeof ts === 'string') {
      const parsed = new Date(ts);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }

  private static checkpointKey(checkpointId: string): string {
    return AgentCoreSnapshotClient.sha256(checkpointId);
  }

  private static writesSessionPrefix(threadId: string): string {
    return `lgw-${AgentCoreSnapshotClient.sha256(threadId).slice(0, 32)}-`;
  }

  private static sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
