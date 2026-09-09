import { PostView } from '../../dto/graphql/post.view';
import { PostTagsResolver } from './post-tags.resolver';

/**
 * O recorte em memória de `Post.tags`, que é a parte da cursor connection que é lógica nossa e não do
 * MikroORM (a de `posts` é do `em.findByCursor`, coberta no `FindAllPostsQueryHandler`).
 */
describe('PostTagsResolver', () => {
  const resolver = new PostTagsResolver();
  const post = Object.assign(new PostView(), {
    tags: ['a', 'b', 'c', 'd', 'e'].map((name, i) => ({ id: `tag-${i}`, name })),
  });

  it('slice cuts the page and flags that there is more', () => {
    const page = resolver.tags(post, 2);

    expect(page.edges.map((e) => e.node.name)).toEqual(['a', 'b']);
    expect(page.pageInfo).toMatchObject({ hasNextPage: true, hasPreviousPage: false });
    expect(page.totalCount).toBe(5);
  });

  it('a cursor points at the last seen tag so the next page starts after it', () => {
    const first = resolver.tags(post, 2);

    const second = resolver.tags(post, 2, first.pageInfo.endCursor);

    expect(second.edges.map((e) => e.node.name)).toEqual(['c', 'd']);
    expect(second.pageInfo).toMatchObject({ hasNextPage: true, hasPreviousPage: true });
  });

  it('the last page has no next', () => {
    const page = resolver.tags(post, 2, resolver.tags(post, 4).pageInfo.endCursor);

    expect(page.edges.map((e) => e.node.name)).toEqual(['e']);
    expect(page.pageInfo.hasNextPage).toBe(false);
  });

  it('a limit larger than the collection is not an error', () => {
    const page = resolver.tags(post, 50);

    expect(page.edges).toHaveLength(5);
    expect(page.pageInfo).toMatchObject({ hasNextPage: false, startCursor: expect.any(String), endCursor: expect.any(String) });
  });

  it('an empty list is an empty page', () => {
    const page = resolver.tags(Object.assign(new PostView(), { tags: [] }));

    expect(page.edges).toEqual([]);
    expect(page.pageInfo).toEqual({ hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null });
  });

  it('each edge gets the cursor of its absolute position', () => {
    const first = resolver.tags(post, 3);
    const second = resolver.tags(post, 3, first.pageInfo.endCursor);

    expect(second.edges[0].cursor).not.toEqual(first.edges[0].cursor);
    expect(resolver.tags(post, 1, second.edges[0].cursor).edges[0].node.name).toBe('e');
  });
});
