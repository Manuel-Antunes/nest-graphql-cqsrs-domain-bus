import {
  BedrockAgentCoreClient,
  type BedrockAgentCoreClientConfig,
  CreateEventCommand,
  type CreateEventCommandInput,
  type CreateEventCommandOutput,
  DeleteEventCommand,
  type Event,
  ListEventsCommand,
  type ListEventsCommandInput,
} from '@aws-sdk/client-bedrock-agentcore';

import { EventDecodingError } from './constants';
import type { EventSerializer } from './event-serializer';
import type { CheckpointStorageEvent } from './models';

/** The one method of the AgentCore data-plane client the checkpointer calls. */
export type AgentCoreMemoryClient = Pick<BedrockAgentCoreClient, 'send'>;

/** How an {@link AgentCoreEventClient} reaches AgentCore Memory and retries a conflict. */
export interface AgentCoreEventClientOptions {
  /** A client of your own; otherwise one is built from `clientConfig`. */
  readonly client?: AgentCoreMemoryClient;
  readonly clientConfig?: BedrockAgentCoreClientConfig;
  /** Attempts after the first when `CreateEvent` answers `RetryableConflictException`. */
  readonly maxRetries?: number;
  readonly initialBackoffMs?: number;
  readonly maxBackoffMs?: number;
}

/** Decoded blobs, and whether a cap left some of the session unread. */
export interface EventReadResult {
  readonly events: CheckpointStorageEvent[];
  readonly truncated: boolean;
}

/**
 * Stores checkpoint events as blobs of AgentCore Memory events and reads them back, one session
 * at a time.
 */
export class AgentCoreEventClient {
  static readonly DEFAULT_MAX_RETRIES = 3;
  static readonly DEFAULT_INITIAL_BACKOFF_MS = 100;
  static readonly DEFAULT_MAX_BACKOFF_MS = 2000;
  /** `CreateEvent` accepts at most this many payload items. */
  static readonly MAX_PAYLOAD_ITEMS_PER_EVENT = 100;
  /** `CreateEvent` accepts an event of at most 10 MB. */
  static readonly MAX_PAYLOAD_BYTES_PER_EVENT = 10_000_000;
  static readonly USER_AGENT = 'x-client-framework:langgraph_agentcore_memory';

  protected readonly client: AgentCoreMemoryClient;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(
    protected readonly memoryId: string,
    protected readonly serializer: EventSerializer,
    options: AgentCoreEventClientOptions = {},
  ) {
    this.client =
      options.client ??
      new BedrockAgentCoreClient({
        ...options.clientConfig,
        customUserAgent: AgentCoreEventClient.USER_AGENT,
      });
    this.maxRetries =
      options.maxRetries ?? AgentCoreEventClient.DEFAULT_MAX_RETRIES;
    this.initialBackoffMs =
      options.initialBackoffMs ??
      AgentCoreEventClient.DEFAULT_INITIAL_BACKOFF_MS;
    this.maxBackoffMs =
      options.maxBackoffMs ?? AgentCoreEventClient.DEFAULT_MAX_BACKOFF_MS;
  }

  async storeBlobEvent(
    event: CheckpointStorageEvent,
    sessionId: string,
    actorId: string,
  ): Promise<void> {
    await this.createEvent({
      memoryId: this.memoryId,
      actorId,
      sessionId,
      eventTimestamp: new Date(),
      payload: [{ blob: await this.serializer.serializeEvent(event) }],
    });
  }

  /** Stores the events in as few `CreateEvent` calls as the item and size limits allow. */
  async storeBlobEventsBatch(
    events: readonly CheckpointStorageEvent[],
    sessionId: string,
    actorId: string,
    {
      maxPayloadItems = AgentCoreEventClient.MAX_PAYLOAD_ITEMS_PER_EVENT,
      maxPayloadBytes = AgentCoreEventClient.MAX_PAYLOAD_BYTES_PER_EVENT,
    }: { maxPayloadItems?: number; maxPayloadBytes?: number } = {},
  ): Promise<void> {
    const blobs = await Promise.all(
      events.map((event) => this.serializer.serializeEvent(event)),
    );
    const timestamp = new Date();
    for (const chunk of AgentCoreEventClient.chunkPayload(
      blobs,
      maxPayloadItems,
      maxPayloadBytes,
    )) {
      await this.createEvent({
        memoryId: this.memoryId,
        actorId,
        sessionId,
        eventTimestamp: timestamp,
        payload: chunk.map((blob) => ({ blob })),
      });
    }
  }

  /** Splits serialized blobs into chunks within both the item count and the byte size. */
  static chunkPayload(
    blobs: readonly string[],
    maxItems: number,
    maxBytes: number,
  ): string[][] {
    const chunks: string[][] = [];
    let current: string[] = [];
    let currentBytes = 0;
    for (const blob of blobs) {
      const size = Buffer.byteLength(blob, 'utf8');
      if (
        current.length > 0 &&
        (current.length >= maxItems || currentBytes + size > maxBytes)
      ) {
        chunks.push(current);
        current = [];
        currentBytes = 0;
      }
      current.push(blob);
      currentBytes += size;
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
  }

  /** Every decoded blob of the session; warns when `limit` left some unread. */
  async getEvents(
    sessionId: string,
    actorId: string,
    limit?: number,
    maxResults: number | undefined = 100,
  ): Promise<CheckpointStorageEvent[]> {
    const result = await this.readEvents(sessionId, actorId, limit, maxResults);
    if (result.truncated) {
      process.emitWarning(
        `Stopped retrieving events at limit of ${limit}. There may be additional checkpoints that were not retrieved. Consider increasing the limit parameter, or leave it unset for no limit.`,
      );
    }
    return result.events;
  }

  /**
   * Decoded blobs of the session, newest event first, at most `limit` of them; `truncated` says
   * whether a blob or a page was left unread.
   */
  async readEvents(
    sessionId: string,
    actorId: string,
    limit?: number,
    maxResults: number | undefined = 100,
  ): Promise<EventReadResult> {
    if (
      (maxResults !== undefined && maxResults <= 0) ||
      (limit !== undefined && limit <= 0)
    ) {
      return { events: [], truncated: false };
    }
    const events: CheckpointStorageEvent[] = [];
    let nextToken: string | undefined;
    let limitReached = false;
    for (;;) {
      const response = await this.client.send(
        new ListEventsCommand({
          memoryId: this.memoryId,
          actorId,
          sessionId,
          includePayloads: true,
          ...(maxResults !== undefined ? { maxResults } : {}),
          ...(nextToken ? { nextToken } : {}),
        }),
      );
      const page = response.events ?? [];
      let truncatedPage = false;
      for (const [eventIndex, event] of page.entries()) {
        const payload = event.payload ?? [];
        for (const [payloadIndex, item] of payload.entries()) {
          if (typeof item.blob !== 'string' || !item.blob) continue;
          try {
            events.push(await this.serializer.deserializeEvent(item.blob));
          } catch (error) {
            if (!(error instanceof EventDecodingError)) throw error;
            process.emitWarning(`Failed to decode event: ${error.message}`);
          }
          if (limit !== undefined && events.length >= limit) {
            limitReached = true;
            truncatedPage =
              payload.slice(payloadIndex + 1).some((rest) => rest.blob) ||
              page
                .slice(eventIndex + 1)
                .some((rest) => (rest.payload ?? []).some((it) => it.blob));
            break;
          }
        }
        if (limitReached) break;
      }
      nextToken = response.nextToken;
      if (limitReached && (truncatedPage || nextToken)) {
        return { events, truncated: true };
      }
      if (limitReached || !nextToken) break;
    }
    return { events, truncated: false };
  }

  /**
   * Deletes every event of the session, one `DeleteEvent` each, listing from the start again after
   * each page: a token issued before the page was deleted points past events it no longer covers.
   */
  async deleteEvents(sessionId: string, actorId: string): Promise<void> {
    const params: ListEventsCommandInput = {
      memoryId: this.memoryId,
      actorId,
      sessionId,
      maxResults: 100,
      includePayloads: false,
    };
    for (;;) {
      const response = await this.client.send(new ListEventsCommand(params));
      const events: Event[] = response.events ?? [];
      if (events.length === 0) break;
      for (const event of events) {
        await this.client.send(
          new DeleteEventCommand({
            memoryId: this.memoryId,
            sessionId,
            eventId: event.eventId,
            actorId,
          }),
        );
      }
    }
  }

  /** `CreateEvent`, retried with exponential backoff on `RetryableConflictException`. */
  protected async createEvent(
    input: CreateEventCommandInput,
  ): Promise<CreateEventCommandOutput> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.client.send(new CreateEventCommand(input));
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.name !== 'RetryableConflictException' ||
          attempt >= this.maxRetries
        ) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(this.initialBackoffMs * 2 ** attempt, this.maxBackoffMs),
          ),
        );
      }
    }
  }
}
