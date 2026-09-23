import type { QueryBus } from '@nestjs/cqrs';
import { Tag } from '@nestposts/posts/domain/tag/tag.entity';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';

import { FindTagQuery } from '../../application/tag/query/find-tag.query';
import { TagEntityResolver } from './tag-entity.resolver';

describe('TagEntityResolver', () => {
  const tagId = TagId.parse('2b8d4c1e-9f70-4a35-8c62-1d0e7f9a3b54');
  const now = new Date('2026-09-08T12:00:00.000Z');

  const resolverOn = (result: unknown) => {
    const dispatched: unknown[] = [];
    const bus = {
      execute: (query: unknown) => {
        dispatched.push(query);
        return Promise.resolve(result);
      },
    } as unknown as QueryBus;
    return { resolver: new TagEntityResolver(bus), dispatched };
  };

  it('dispatches FindTag with the id the representation carries, as a value object', async () => {
    const { resolver, dispatched } = resolverOn(null);

    await resolver.resolveReference({ __typename: 'Tag', id: tagId.value });

    expect(dispatched[0]).toBeInstanceOf(FindTagQuery.FindTag);
    expect((dispatched[0] as FindTagQuery.FindTag).tagId.equals(tagId)).toBe(
      true,
    );
  });

  it('gives back the tag the handler found, untouched', async () => {
    const tag = Tag.create(tagId, 'Untagged', now);
    const { resolver } = resolverOn(tag);

    await expect(
      resolver.resolveReference({ __typename: 'Tag', id: tagId.value }),
    ).resolves.toBe(tag);
  });
});
