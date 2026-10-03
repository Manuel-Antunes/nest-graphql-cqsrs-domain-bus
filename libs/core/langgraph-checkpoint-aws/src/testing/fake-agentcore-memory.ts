import {
  CreateEventCommand,
  DeleteEventCommand,
  type Event,
  type EventMetadataFilterExpression,
  GetEventCommand,
  GetMemoryRecordCommand,
  ListEventsCommand,
  ListSessionsCommand,
  type MemoryRecordSummary,
  RetrieveMemoryRecordsCommand,
} from '@aws-sdk/client-bedrock-agentcore';

import type { AgentCoreMemoryClient } from '../agentcore/agentcore-event-client';

interface StoredEvent extends Event {
  readonly order: number;
  readonly clientToken?: string;
}

/**
 * AgentCore Memory's data plane in a process, as far as a checkpointer uses it: `CreateEvent`
 * (at most 100 payload items, 10 MB, idempotent on `clientToken`), `ListEvents` newest first with
 * metadata filters and pagination, `GetEvent`, `DeleteEvent` and `ListSessions` — the behaviour
 * measured against the service, not a guess at it. The long-term records a strategy would have
 * extracted are whatever a test puts in `records`, found by `RetrieveMemoryRecords` under their
 * namespace and by `GetMemoryRecord` by id.
 */
export class FakeAgentCoreMemory implements AgentCoreMemoryClient {
  static readonly MAX_ITEMS = 100;
  static readonly MAX_EVENT_BYTES = 10_000_000;

  readonly events: StoredEvent[] = [];
  readonly records: MemoryRecordSummary[] = [];
  readonly calls: string[] = [];
  private sequence = 0;

  async send(command: unknown): Promise<never> {
    return this.handle(command) as never;
  }

  eventsOf(actorId: string, sessionId?: string): Event[] {
    return this.events.filter(
      (event) =>
        event.actorId === actorId &&
        (sessionId === undefined || event.sessionId === sessionId),
    );
  }

  sessionsOf(actorId: string): string[] {
    return [
      ...new Set(
        this.eventsOf(actorId).map((event) => String(event.sessionId)),
      ),
    ];
  }

  private handle(command: unknown): unknown {
    if (command instanceof CreateEventCommand) {
      this.calls.push('CreateEvent');
      const { input } = command;
      const payload = input.payload ?? [];
      if (
        payload.length === 0 ||
        payload.length > FakeAgentCoreMemory.MAX_ITEMS
      ) {
        throw FakeAgentCoreMemory.validation(
          'Member must have length less than or equal to 100',
        );
      }
      if (
        Buffer.byteLength(JSON.stringify(payload)) >
        FakeAgentCoreMemory.MAX_EVENT_BYTES
      ) {
        throw FakeAgentCoreMemory.validation('The event exceeds 10 MB');
      }
      const repeated = input.clientToken
        ? this.events.find((event) => event.clientToken === input.clientToken)
        : undefined;
      if (repeated) return { event: FakeAgentCoreMemory.copy(repeated) };
      this.sequence += 1;
      const event: StoredEvent = {
        memoryId: input.memoryId,
        actorId: input.actorId,
        sessionId: input.sessionId,
        eventId: `event-${this.sequence}`,
        eventTimestamp: new Date(input.eventTimestamp ?? Date.now()),
        payload: JSON.parse(JSON.stringify(payload)),
        metadata: input.metadata,
        order: this.sequence,
        clientToken: input.clientToken,
      };
      this.events.push(event);
      return { event: FakeAgentCoreMemory.copy(event) };
    }
    if (command instanceof ListEventsCommand) {
      this.calls.push('ListEvents');
      const { input } = command;
      const matching = this.events
        .filter(
          (event) =>
            event.memoryId === input.memoryId &&
            event.actorId === input.actorId &&
            event.sessionId === input.sessionId &&
            FakeAgentCoreMemory.matches(
              event,
              input.filter?.eventMetadata ?? [],
            ),
        )
        .sort(
          (left, right) =>
            (right.eventTimestamp?.getTime() ?? 0) -
              (left.eventTimestamp?.getTime() ?? 0) || right.order - left.order,
        );
      const start = Number(input.nextToken ?? 0);
      const end = start + (input.maxResults ?? 20);
      return {
        events: matching.slice(start, end).map((event) => ({
          ...FakeAgentCoreMemory.copy(event),
          ...(input.includePayloads === false ? { payload: undefined } : {}),
        })),
        nextToken: end < matching.length ? String(end) : undefined,
      };
    }
    if (command instanceof GetEventCommand) {
      this.calls.push('GetEvent');
      const { input } = command;
      const event = this.events.find(
        (stored) =>
          stored.eventId === input.eventId &&
          stored.actorId === input.actorId &&
          stored.sessionId === input.sessionId,
      );
      if (!event) throw FakeAgentCoreMemory.notFound(String(input.eventId));
      return { event: FakeAgentCoreMemory.copy(event) };
    }
    if (command instanceof DeleteEventCommand) {
      this.calls.push('DeleteEvent');
      const { input } = command;
      const index = this.events.findIndex(
        (event) =>
          event.eventId === input.eventId &&
          event.actorId === input.actorId &&
          event.sessionId === input.sessionId,
      );
      if (index < 0) throw FakeAgentCoreMemory.notFound(String(input.eventId));
      this.events.splice(index, 1);
      return {};
    }
    if (command instanceof ListSessionsCommand) {
      this.calls.push('ListSessions');
      const { input } = command;
      const sessions = this.sessionsOf(String(input.actorId)).sort();
      const start = Number(input.nextToken ?? 0);
      const end = start + (input.maxResults ?? 20);
      return {
        sessionSummaries: sessions.slice(start, end).map((sessionId) => ({
          sessionId,
          actorId: input.actorId,
          createdAt: new Date(),
        })),
        nextToken: end < sessions.length ? String(end) : undefined,
      };
    }
    if (command instanceof RetrieveMemoryRecordsCommand) {
      this.calls.push('RetrieveMemoryRecords');
      const { input } = command;
      return {
        memoryRecordSummaries: this.records
          .filter((record) =>
            (record.namespaces ?? []).some((namespace) =>
              input.namespace !== undefined
                ? namespace === input.namespace
                : namespace.startsWith(String(input.namespacePath)),
            ),
          )
          .slice(0, input.maxResults ?? input.searchCriteria?.topK ?? 10)
          .map((record) => ({ ...record, score: record.score ?? 1 })),
      };
    }
    if (command instanceof GetMemoryRecordCommand) {
      this.calls.push('GetMemoryRecord');
      const record = this.records.find(
        (candidate) =>
          candidate.memoryRecordId === command.input.memoryRecordId,
      );
      if (!record) {
        throw FakeAgentCoreMemory.notFound(
          String(command.input.memoryRecordId),
        );
      }
      return { memoryRecord: record };
    }
    throw new Error(`FakeAgentCoreMemory does not answer ${String(command)}`);
  }

  private static matches(
    event: Event,
    filters: readonly EventMetadataFilterExpression[],
  ): boolean {
    return filters.every(
      (filter) =>
        event.metadata?.[String(filter.left?.metadataKey)]?.stringValue ===
        filter.right?.metadataValue?.stringValue,
    );
  }

  private static copy(event: StoredEvent): Event {
    const { order: _order, clientToken: _clientToken, ...rest } = event;
    return JSON.parse(JSON.stringify(rest), (key, value) =>
      key === 'eventTimestamp' ? new Date(value) : value,
    ) as Event;
  }

  private static validation(message: string): Error {
    return Object.assign(new Error(message), { name: 'ValidationException' });
  }

  private static notFound(eventId: string): Error {
    return Object.assign(new Error(`Event ${eventId} not found`), {
      name: 'ResourceNotFoundException',
    });
  }
}
