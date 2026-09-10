import { TagCreatedEvent } from './event/tag-created.event';
import { InvalidTagException } from './exception/invalid-tag.exception';
import { Tag } from './tag.entity';
import { TagId } from './vo/tag-id';
import { TagName } from './vo/tag-name';

describe('Tag', () => {
  const id = TagId.parse('5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f');
  const now = new Date('2026-09-08T12:00:00.000Z');

  it('create normalizes, raises TagCreated and returns the tag', () => {
    const tag = Tag.create(id, '  Untagged ', now);

    expect(tag).toMatchObject({ id, name: TagName.parse('Untagged'), createdAt: now });
    expect(tag.getUncommittedEvents()).toEqual([new TagCreatedEvent(id.value, 'Untagged', now)]);
  });

  it('create with a blank name raises nothing', () => {
    expect(() => Tag.create(id, '   ', now)).toThrow(InvalidTagException);
    expect(() => Tag.create(id, 'x'.repeat(51), now)).toThrow(/excede 50 caracteres/);
  });

  it('the name value object trims and rejects the empty string', () => {
    expect(TagName.parse('  dev  ').value).toBe('dev');
    expect(TagName.safeParse('').success).toBe(false);
  });
});
