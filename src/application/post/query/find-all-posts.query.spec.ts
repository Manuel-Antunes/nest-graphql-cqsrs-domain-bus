import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, inRequestContext } from '../../../../test/support/cqrs-testing-module';
import { givenAPost, T0 } from '../../../../test/support/post-fixtures';
import { FindAllPostsQuery } from './find-all-posts.query';

/**
 * A mecânica da cursor connection de `posts`, que é do `em.findByCursor`: a linha a mais que decide o
 * `hasNextPage` nunca vaza, o `endCursor` de uma página é o `after` da seguinte, e a ordem é
 * `createdAt, id`.
 */
describe('FindAllPostsQuery.Handler', () => {
  let module: TestingModule;
  let handler: FindAllPostsQuery.Handler;

  beforeEach(async () => {
    module = await createCqrsTestingModule([FindAllPostsQuery.Handler]);
    handler = module.get(FindAllPostsQuery.Handler);
    for (const [index, title] of ['primeiro', 'segundo', 'terceiro'].entries()) {
      await givenAPost(module, { title, createdAt: new Date(T0.getTime() + index * 1000) });
    }
  });

  afterEach(() => module.close());

  it('returns exactly the requested page and flags that there is more', async () => {
    const page = await inRequestContext(module, () => handler.execute(new FindAllPostsQuery.FindAllPosts(2)));

    expect(page.items.map((p) => p.title.value)).toEqual(['primeiro', 'segundo']);
    expect(page.hasNextPage).toBe(true);
    expect(page.hasPrevPage).toBe(false);
    expect(page.totalCount).toBe(3);
    expect(page.endCursor).toEqual(expect.any(String));
  });

  it('a cursor points at the last seen row so the next page starts after it', async () => {
    const first = await inRequestContext(module, () => handler.execute(new FindAllPostsQuery.FindAllPosts(2)));

    const second = await inRequestContext(module, () => handler.execute(new FindAllPostsQuery.FindAllPosts(2, first.endCursor)));

    expect(second.items.map((p) => p.title.value)).toEqual(['terceiro']);
    expect(second.hasNextPage).toBe(false);
    expect(second.hasPrevPage).toBe(true);
  });

  it('the last full page knows there is nothing after it', async () => {
    const page = await inRequestContext(module, () => handler.execute(new FindAllPostsQuery.FindAllPosts(3)));

    expect(page.items).toHaveLength(3);
    expect(page.hasNextPage).toBe(false);
  });

  it('the cursor of each edge is the cursor of that row', async () => {
    const all = await inRequestContext(module, () => handler.execute(new FindAllPostsQuery.FindAllPosts(3)));

    const afterFirst = await inRequestContext(module, () => handler.execute(new FindAllPostsQuery.FindAllPosts(3, all.from(all.items[0]))));

    expect(afterFirst.items.map((p) => p.title.value)).toEqual(['segundo', 'terceiro']);
  });

  it('without a first the page size is the default, and it is capped at the maximum', () => {
    expect(new FindAllPostsQuery.FindAllPosts(undefined).first).toBe(20);
    expect(new FindAllPostsQuery.FindAllPosts(0).first).toBe(1);
    expect(new FindAllPostsQuery.FindAllPosts(10_000).first).toBe(FindAllPostsQuery.MAX_PAGE_SIZE);
  });
});
