import type { TestingModule } from '@nestjs/testing';
import { QueryBus } from '@nestjs/cqrs';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';

import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../../test/support/cqrs-testing-module';
import { givenAPost, givenATag } from '../../../../test/support/post-fixtures';
import { FindPostQuery } from './find-post.query';

describe('FindPostQuery.Handler', () => {
  let module: TestingModule;
  let queries: QueryBus;

  const execute = (postId: PostId) =>
    inRequestContext(module, () =>
      queries.execute(new FindPostQuery.FindPost(postId)),
    );

  beforeEach(async () => {
    module = await createCqrsTestingModule([FindPostQuery.Handler]);
    queries = module.get(QueryBus);
  });

  afterEach(() => module.close());

  it('devolve o Post gravado, e não uma cópia de leitura', async () => {
    const post = await givenAPost(module, { title: 'Nest + GraphQL' });

    const found = await execute(post.id);

    expect(found).toBeInstanceOf(Post);
    expect(found!.id.equals(post.id)).toBe(true);
    expect(found!.title.value).toBe('Nest + GraphQL');
  });

  it('vem com tags e autor populados, que é o que a borda precisa', async () => {
    const tag = await givenATag(module, 'dev');
    const post = await givenAPost(module, { tags: [tag] });

    const found = await execute(post.id);

    expect(found!.tags.isInitialized()).toBe(true);
    expect(found!.tags.getItems().map((each) => each.name.value)).toEqual([
      'dev',
    ]);
    expect(found!.author.delegated().name.value).toBe('manuel');
  });

  it('um id que não existe é null, e não exceção', async () => {
    expect(await execute(PostId.generate())).toBeNull();
  });

  it('um post apagado não é encontrado — o filtro de ativos vale para a leitura também', async () => {
    const post = await givenAPost(module);
    const em = freshEm(module);
    const gravado = await em.findOneOrFail(Post, { id: post.id });
    gravado.softDelete(new Date());
    gravado.uncommit();
    await em.flush();

    expect(await execute(post.id)).toBeNull();
  });

  it('a leitura não dispara evento nenhum: consultar não é um fato', async () => {
    const post = await givenAPost(module);

    const found = await execute(post.id);

    expect(found!.getUncommittedEvents()).toEqual([]);
  });
});
