import {
  DEFAULT_EVENT_VERSION,
  EventType,
  eventTagsOf,
  eventTypeFor,
  eventTypeOf,
  namespaceIn,
  qualifiedNameIn,
  requireEventTypeOf,
} from './event-type';
import { EventTypeConflictException, EventTypeMissingException } from './event-type.exception';

describe('@EventType', () => {
  @EventType({ namespace: 'catalog', tags: ['thingId'] })
  class ThingHappenedEvent {
    constructor(
      readonly thingId: string,
      readonly occurredAt: Date,
    ) {}
  }

  @EventType({ namespace: 'catalog', name: 'ThingRenamed', version: '2.1.0', tags: ['thingId'] })
  class RenamedEvent {
    constructor(readonly thingId: { value: string }) {}
  }

  it('derives the local name from the class, dropping the Event suffix', () => {
    expect(eventTypeOf(ThingHappenedEvent)).toMatchObject({
      namespace: 'catalog',
      name: 'ThingHappened',
      version: DEFAULT_EVENT_VERSION,
      qualifiedName: 'catalog.ThingHappened',
      messageType: `catalog.ThingHappened#${DEFAULT_EVENT_VERSION}`,
    });
  });

  it('takes the name and the version from the options when they are given', () => {
    expect(eventTypeOf(RenamedEvent)).toMatchObject({
      name: 'ThingRenamed',
      version: '2.1.0',
      messageType: 'catalog.ThingRenamed#2.1.0',
    });
  });

  it('reads the metadata off an instance as well as off the class', () => {
    const event = new ThingHappenedEvent('t-1', new Date());

    expect(eventTypeOf(event)).toBe(eventTypeOf(ThingHappenedEvent));
  });

  it('resolves a class back from the message type, and from the qualified name alone', () => {
    expect(eventTypeFor('catalog.ThingRenamed#2.1.0')?.eventClass).toBe(RenamedEvent);
    expect(eventTypeFor('catalog.ThingRenamed')?.eventClass).toBe(RenamedEvent);
  });

  it('does not resolve a name nobody declared', () => {
    expect(eventTypeFor('catalog.NeverDeclared#1.0.0')).toBeUndefined();
  });

  it('refuses two classes under the same qualified name', () => {
    expect(() => {
      @EventType({ namespace: 'catalog', name: 'ThingHappened' })
      class Impostor {}
      return Impostor;
    }).toThrow(EventTypeConflictException);
  });

  it('names the class in the error when the metadata is missing', () => {
    class Undeclared {}

    expect(() => requireEventTypeOf(new Undeclared())).toThrow(EventTypeMissingException);
    expect(() => requireEventTypeOf(new Undeclared())).toThrow(/Undeclared has no @EventType/);
  });

  describe('tags', () => {
    it('reads the declared properties off the event', () => {
      const event = new ThingHappenedEvent('t-1', new Date());

      expect(eventTagsOf(event)).toEqual([{ key: 'thingId', value: 't-1' }]);
    });

    it('unwraps a value object', () => {
      expect(eventTagsOf(new RenamedEvent({ value: 't-2' }))).toEqual([
        { key: 'thingId', value: 't-2' },
      ]);
    });

    it('skips a property that is not there, instead of tagging undefined', () => {
      @EventType({ namespace: 'catalog', tags: ['thingId', 'ownerId'] })
      class PartiallyTaggedEvent {
        constructor(readonly thingId: string) {}
      }

      expect(eventTagsOf(new PartiallyTaggedEvent('t-3'))).toEqual([
        { key: 'thingId', value: 't-3' },
      ]);
    });

    it('is empty for an event that declares no tag', () => {
      @EventType({ namespace: 'catalog' })
      class UntaggedEvent {}

      expect(eventTagsOf(new UntaggedEvent())).toEqual([]);
    });

    it('comes out in a stable order, so the same event serializes the same way twice', () => {
      @EventType({ namespace: 'catalog', tags: ['zeta', 'alpha'] })
      class TwiceTaggedEvent {
        constructor(
          readonly zeta: string,
          readonly alpha: string,
        ) {}
      }

      expect(eventTagsOf(new TwiceTaggedEvent('z', 'a')).map((tag) => tag.key)).toEqual([
        'alpha',
        'zeta',
      ]);
    });
  });

  describe('reading a message type apart', () => {
    it('splits the qualified name off the version', () => {
      expect(qualifiedNameIn('posts.PostCreated#1.0.0')).toBe('posts.PostCreated');
      expect(qualifiedNameIn('posts.PostCreated')).toBe('posts.PostCreated');
    });

    it('splits the namespace off the local name', () => {
      expect(namespaceIn('posts.PostCreated#1.0.0')).toBe('posts');
      expect(namespaceIn('deeply.nested.PostCreated')).toBe('deeply.nested');
    });
  });
});
