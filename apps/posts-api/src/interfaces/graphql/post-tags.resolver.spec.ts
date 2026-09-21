import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { PostView } from '../../dto/graphql/post.view';
import { TagView } from '../../dto/graphql/tag.view';
import { PostTagsResolver } from './post-tags.resolver';

describe('PostTagsResolver', () => {
  const resolver = new PostTagsResolver();

  const viewWith = (names: string[]) =>
    new PostView({
      id: PostId.generate(),
      title: 'um post',
      content: 'conteúdo',
      authorId: UserId.generate().value,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      tags: names.map((name) => new TagView({ id: TagId.generate(), name })),
    });

  const post = viewWith(['a', 'b', 'c', 'd', 'e']);
  const names = (page: { items: TagView[] }) => page.items.map((tag) => tag.name.value);

  it('corta a página e sinaliza que há mais', () => {
    const page = resolver.tags(post, 2);

    expect(names(page)).toEqual(['a', 'b']);
    expect(page.hasNextPage).toBe(true);
    expect(page.hasPrevPage).toBe(false);
    expect(page.totalCount).toBe(5);
  });

  it('o cursor aponta para a última tag vista, e a página seguinte começa depois dela', () => {
    const first = resolver.tags(post, 2);

    const second = resolver.tags(post, 2, first.endCursor);

    expect(names(second)).toEqual(['c', 'd']);
    expect(second.hasNextPage).toBe(true);
    expect(second.hasPrevPage).toBe(true);
  });

  it('a última página não tem próxima', () => {
    const page = resolver.tags(post, 2, resolver.tags(post, 4).endCursor);

    expect(names(page)).toEqual(['e']);
    expect(page.hasNextPage).toBe(false);
  });

  it('um limite maior que a coleção não é erro', () => {
    const page = resolver.tags(post, 50);

    expect(page.items).toHaveLength(5);
    expect(page.hasNextPage).toBe(false);
    expect(page.startCursor).toEqual(expect.any(String));
    expect(page.endCursor).toEqual(expect.any(String));
  });

  it('uma lista vazia é uma página vazia', () => {
    const page = resolver.tags(viewWith([]));

    expect(page.items).toEqual([]);
    expect(page).toMatchObject({ hasNextPage: false, hasPrevPage: false, startCursor: null, endCursor: null });
  });

  it('cada item leva o cursor da sua posição absoluta', () => {
    const first = resolver.tags(post, 3);
    const second = resolver.tags(post, 3, first.endCursor);

    expect(second.from(second.items[0])).not.toEqual(first.from(first.items[0]));
    expect(names(resolver.tags(post, 1, second.from(second.items[0])))).toEqual(['e']);
  });
});
