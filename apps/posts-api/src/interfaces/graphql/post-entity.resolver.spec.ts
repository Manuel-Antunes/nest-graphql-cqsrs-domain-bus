import type { QueryBus } from '@nestjs/cqrs';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';

import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostEntityResolver } from './post-entity.resolver';

describe('PostEntityResolver', () => {
  const postId = PostId.parse('7f3c1a2b-4d5e-4f60-8a71-92b3c4d5e6f7');

  const resolverOn = (result: unknown) => {
    const dispatched: unknown[] = [];
    const bus = {
      execute: (query: unknown) => {
        dispatched.push(query);
        return Promise.resolve(result);
      },
    } as unknown as QueryBus;
    return { resolver: new PostEntityResolver(bus), dispatched };
  };

  it('dispatches FindPost with the id the representation carries, as a value object', async () => {
    const { resolver, dispatched } = resolverOn(null);

    await resolver.resolveReference({ __typename: 'Post', id: postId.value });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toBeInstanceOf(FindPostQuery.FindPost);
    expect(
      (dispatched[0] as FindPostQuery.FindPost).postId.equals(postId),
    ).toBe(true);
  });

  it('a key that resolves to nothing is null, which is the position the router reads', async () => {
    const { resolver } = resolverOn(null);

    await expect(
      resolver.resolveReference({ __typename: 'Post', id: postId.value }),
    ).resolves.toBeNull();
  });

  it('an id that is not an id is refused before any query is dispatched', async () => {
    const { resolver, dispatched } = resolverOn(null);

    expect(() =>
      resolver.resolveReference({ __typename: 'Post', id: 'not-an-id' }),
    ).toThrow();
    expect(dispatched).toHaveLength(0);
  });
});
