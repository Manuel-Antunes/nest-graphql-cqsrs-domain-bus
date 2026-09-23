import {
  decodeTags,
  encodeTags,
  EventEnvelope,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
} from './event-envelope';

describe('EventEnvelope', () => {
  const metadata = {
    [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCreated#1.0.0',
    [TRANSPORT_IDENTIFIER]: 'evt-1',
    [TRANSPORT_ORIGIN]: 'posts-api',
    [TRANSPORT_TAGS]: 'postId=p-1',
  };

  const overTheWire = (body: object) => {
    const sent = new EventEnvelope(body, metadata).encoded();
    const received = JSON.parse(
      JSON.stringify({ data: sent.data, metadata: sent.metadata }),
    ) as {
      data: Record<string, unknown>;
      metadata: Record<string, string>;
    };
    return new EventEnvelope(received.data, received.metadata).decoded();
  };

  describe('the two halves', () => {
    it('carries the event as itself, field for field', () => {
      const body = {
        postId: 'p-1',
        title: 'Nest',
        tags: [{ tagId: 't-1', name: 'Untagged' }],
        version: 2,
      };

      expect(overTheWire(body).data).toEqual(body);
    });

    it('reads what is said about the event off the metadata', () => {
      const envelope = new EventEnvelope({}, metadata);

      expect(envelope.messageType).toBe('posts.PostCreated#1.0.0');
      expect(envelope.identifier).toBe('evt-1');
      expect(envelope.origin).toBe('posts-api');
      expect(envelope.tags).toEqual([{ key: 'postId', value: 'p-1' }]);
    });

    it('answers for an envelope that carries none of it, instead of throwing', () => {
      const envelope = new EventEnvelope({}, {});

      expect(envelope.messageType).toBe('');
      expect(envelope.origin).toBeUndefined();
      expect(envelope.tags).toEqual([]);
    });
  });

  describe('the body', () => {
    it('brings a Date back as a Date, which plain JSON cannot', () => {
      const occurredAt = new Date('2026-09-08T12:00:00.000Z');

      const decoded = overTheWire({ occurredAt }).data;

      expect(decoded.occurredAt).toBeInstanceOf(Date);
      expect(decoded.occurredAt).toEqual(occurredAt);
    });

    it('brings back a Date nested in an array or another object', () => {
      const at = new Date('2026-09-08T12:00:00.000Z');

      const decoded = overTheWire({ page: { items: [{ at }] } }).data as {
        page: { items: { at: Date }[] };
      };

      expect(decoded.page.items[0].at).toBeInstanceOf(Date);
    });

    it('leaves a string that merely looks like a date a string', () => {
      expect(
        overTheWire({ content: '2026-09-08T12:00:00.000Z' }).data.content,
      ).toBe('2026-09-08T12:00:00.000Z');
    });

    it('goes on the wire as the event, not as a wrapper around it', () => {
      const sent = new EventEnvelope({ title: 'Nest' }, metadata).encoded();

      expect(JSON.stringify(sent.data)).toBe('{"title":"Nest"}');
    });
  });

  describe('the tags, flattened for a header', () => {
    it('survives the round trip', () => {
      const tags = [{ key: 'postId', value: 'p-1' }];

      expect(decodeTags(encodeTags(tags))).toEqual(tags);
    });

    it('keeps a value containing the separators from splitting the record', () => {
      const tags = [{ key: 'weird;key', value: 'a=b;c' }];

      expect(decodeTags(encodeTags(tags))).toEqual(tags);
    });

    it('reads no tags as no tags', () => {
      expect(decodeTags(undefined)).toEqual([]);
      expect(decodeTags('')).toEqual([]);
    });
  });
});
