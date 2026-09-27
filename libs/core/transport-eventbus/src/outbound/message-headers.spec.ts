import {
  decodeData,
  decodeTags,
  encodeData,
  encodeTags,
} from './message-headers';

describe('what a message carries', () => {
  const overTheWire = (body: object) =>
    decodeData(JSON.parse(JSON.stringify(encodeData(body))));

  it('carries the event as itself, field for field', () => {
    const body = {
      postId: 'p-1',
      title: 'Nest',
      tags: [{ tagId: 't-1', name: 'Untagged' }],
      version: 2,
    };

    expect(overTheWire(body)).toEqual(body);
  });

  describe('the body', () => {
    it('brings a Date back as a Date, which plain JSON cannot', () => {
      const occurredAt = new Date('2026-09-08T12:00:00.000Z');

      const decoded = overTheWire({ occurredAt });

      expect(decoded.occurredAt).toBeInstanceOf(Date);
      expect(decoded.occurredAt).toEqual(occurredAt);
    });

    it('brings back a Date nested in an array or another object', () => {
      const at = new Date('2026-09-08T12:00:00.000Z');

      const decoded = overTheWire({ page: { items: [{ at }] } }) as {
        page: { items: { at: Date }[] };
      };

      expect(decoded.page.items[0].at).toBeInstanceOf(Date);
    });

    it('leaves a string that merely looks like a date a string', () => {
      expect(overTheWire({ content: '2026-09-08T12:00:00.000Z' }).content).toBe(
        '2026-09-08T12:00:00.000Z',
      );
    });

    it('goes on the wire as the event, not as a wrapper around it', () => {
      expect(JSON.stringify(encodeData({ title: 'Nest' }))).toBe(
        '{"title":"Nest"}',
      );
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
