import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { EventType } from '@nestposts/platform/domain/shared/event-type';
import { EventStore } from './event-store';
import { EventStoreSink } from './event-store.sink';

@EventType({ namespace: 'things', tags: ['thingId'] })
class ThingHappenedEvent implements DomainEvent {
  constructor(
    readonly thingId: string,
    readonly occurredAt: Date,
  ) {}
}

@EventType({ namespace: 'things' })
class SomethingHappenedEvent implements DomainEvent {
  constructor(readonly occurredAt: Date) {}
}

class RecordingStore extends EventStore {
  readonly appended: { streamId: string; events: readonly object[] }[] = [];

  async read(): Promise<object[]> {
    return [];
  }

  async append(streamId: string, events: readonly object[]): Promise<void> {
    this.appended.push({ streamId, events });
  }
}

describe('the sink of an event-sourced service', () => {
  let store: RecordingStore;
  let sink: EventStoreSink;

  const now = new Date('2026-09-08T12:00:00.000Z');

  beforeEach(() => {
    store = new RecordingStore();
    sink = new EventStoreSink(store);
  });

  it('appends the event to the stream of the aggregate it names', async () => {
    const event = new ThingHappenedEvent('thing-1', now);

    await sink.receive(event);

    expect(store.appended).toEqual([{ streamId: 'thing-1', events: [event] }]);
  });

  it('appends nothing for an event that names no aggregate, instead of picking a stream for it', async () => {
    await sink.receive(new SomethingHappenedEvent(now));

    expect(store.appended).toEqual([]);
  });
});
