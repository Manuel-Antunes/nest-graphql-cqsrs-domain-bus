import { EventType } from '@nestposts/platform/domain/shared/event-type';
import { EventAddress } from './event-address';
import { identifierOf } from './transport-metadata';

@EventType({ namespace: 'posts', tags: ['postId'] })
class PostCreatedEvent {
  constructor(
    readonly postId: string,
    readonly occurredAt: Date,
  ) {}
}

@EventType({ namespace: 'posts', name: 'PostRetagged', version: '2.0.0', tags: ['postId', 'tagId'] })
class RetaggedEvent {
  constructor(
    readonly postId: string,
    readonly tagId: string,
  ) {}
}

@EventType({ namespace: 'posts' })
class UntaggedEvent {}

class UndeclaredEvent {
  constructor(readonly message: string) {}
}

describe('EventAddress', () => {
  it('reads namespace, qualified name and message type off the event', () => {
    const address = EventAddress.of(new PostCreatedEvent('p-1', new Date()));

    expect(address).toMatchObject({
      namespace: 'posts',
      qualifiedName: 'posts.PostCreated',
      messageType: 'posts.PostCreated#1.0.0',
      orderingKey: 'p-1',
    });
  });

  it('ends the ordering key in the aggregate tag, which is what a binding matches on', () => {
    expect(EventAddress.of(new PostCreatedEvent('p-42', new Date())).orderingKey).toBe('p-42');
  });

  it('falls back to the sentinel when the event carries no tag', () => {
    expect(EventAddress.of(new UntaggedEvent()).orderingKey).toBe(EventAddress.NO_AGGREGATE);
  });

  it('picks the first tag in order when an event declares two, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const address = EventAddress.of(new RetaggedEvent('p-1', 't-1'));

    expect(address.orderingKey).toBe('p-1');
    expect(address.tags.map((tag) => tag.key)).toEqual(['postId', 'tagId']);
    warn.mockRestore();
  });

  it('gives an event with no @EventType its class name, which is what upstream carries', () => {
    const address = EventAddress.of(new UndeclaredEvent('hello'));

    expect(address).toMatchObject({
      namespace: '',
      qualifiedName: 'UndeclaredEvent',
      messageType: 'UndeclaredEvent',
      orderingKey: EventAddress.NO_AGGREGATE,
    });
  });

  it('keeps one identifier per event instance, so a retry is a redelivery and not a new fact', () => {
    const event = new PostCreatedEvent('p-1', new Date());

    expect(EventAddress.of(event).identifier).toBe(EventAddress.of(event).identifier);
    expect(EventAddress.of(event).identifier).toBe(identifierOf(event));
    expect(EventAddress.of(new PostCreatedEvent('p-1', new Date())).identifier).not.toBe(
      identifierOf(event),
    );
  });

  it('rebuilds an address from a message type, for what arrives from the wire', () => {
    const address = EventAddress.fromMessageType('posts.PostCreated#1.0.0', 'evt-1', [
      { key: 'postId', value: 'p-7' },
    ]);

    expect(address).toMatchObject({
      namespace: 'posts',
      qualifiedName: 'posts.PostCreated',
      orderingKey: 'p-7',
      identifier: 'evt-1',
    });
  });
});
