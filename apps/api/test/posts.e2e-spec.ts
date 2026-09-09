import type { INestApplication } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { SubscriptionBus } from '@app/cqsrs';
import { GraphqlClient, until } from './support/graphql-client';

/**
 * A aplicação inteira — Express, Apollo, MikroORM (SQLite em memória, via `POSTS_DB` no config do
 * Vitest), CQRS — e um cliente GraphQL de verdade: HTTP para queries/mutations, graphql-ws para as
 * subscriptions. É o `poc-smoke.sh` da versão Java como teste, com o que ele tem de interessante:
 * a ordem entre command, evento e entrega na subscription, e o filtro por tópico.
 */
describe('posts (e2e)', () => {
  let app: INestApplication;
  let client: GraphqlClient;
  let eventBus: EventBus;
  /**
   * Quantos assinantes o `EventBus` tem. Cada *stream* do `SubscriptionBus` é exatamente um — o que
   * não é o mesmo que cada assinante GraphQL: assinantes com o mesmo critério dividem um stream.
   */
  const subscribers = () => eventBus.subject$.observers.length;
  /** Cada `subscriptionBus.subscribe(...)` — ou seja, cada assinante GraphQL, compartilhando ou não. */
  const asked: unknown[] = [];

  const POST_FIELDS = 'id title content author createdAt updatedAt version tags(first: 5) { edges { cursor node { id name } } pageInfo { hasNextPage } totalCount }';
  const createPost = async (title: string, content = 'oi', author = 'manuel') => {
    const result = await client.execute(
      `mutation($input: CreatePostInput!) { createPost(input: $input) { ${POST_FIELDS} } }`,
      { input: { title, content, author } },
    );
    expect(result.errors).toBeUndefined();
    return result.data!.createPost;
  };
  const updatePost = (input: { id: string; title?: string | null; content?: string | null }) =>
    client.execute(`mutation($input: UpdatePostInput!) { updatePost(input: $input) { ${POST_FIELDS} } }`, { input });
  /** Assina `onPostUpdated` e espera o assinante aparecer no EventBus; `release()` cancela e espera ele sumir. */
  const subscribeUpdates = async (postId?: string) => {
    const before = subscribers();
    const collector = client.subscribe<{ onPostUpdated: any }>(
      `subscription($postId: ID) { onPostUpdated(postId: $postId) { ${POST_FIELDS} } }`,
      { postId },
    );
    await until(() => subscribers() === before + 1);
    const release = async () => {
      collector.unsubscribe();
      await until(() => subscribers() === before);
    };
    return Object.assign(collector, { release });
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    client = await GraphqlClient.for(app);
    eventBus = app.get(EventBus);
    app.get(SubscriptionBus).subscriptions$.subscribe((subscription) => asked.push(subscription));
  });

  afterAll(async () => {
    await client.dispose();
    await app.close();
  });

  describe('createPost', () => {
    it('returns the post as it was born and delivers it on onPostCreated', async () => {
      const before = subscribers();
      const created = client.subscribe<{ onPostCreated: any }>(`subscription { onPostCreated { ${POST_FIELDS} } }`);
      await until(() => subscribers() === before + 1);

      const post = await createPost('  Nest + GraphQL  ');

      expect(post).toMatchObject({ title: 'Nest + GraphQL', content: 'oi', author: 'manuel' });
      expect(post.version).toBeGreaterThanOrEqual(1);
      const [event] = await created.waitFor(1);
      expect(event.onPostCreated).toMatchObject({ id: post.id, title: 'Nest + GraphQL', version: 1, tags: { edges: [] } });
      expect(event.onPostCreated.createdAt).toBe(event.onPostCreated.updatedAt);

      created.unsubscribe();
      await until(() => subscribers() === before);
    });

    it('gets the default tag through the saga, and the client sees it arrive on onPostUpdated', async () => {
      const updates = await subscribeUpdates();

      const post = await createPost('com tag padrão');
      const [event] = await updates.waitFor(1);

      expect(event.onPostUpdated).toMatchObject({
        id: post.id,
        version: 2,
        tags: { edges: [{ node: { name: 'Untagged' } }], totalCount: 1 },
      });
      const { data } = await client.execute(`{ post(id: "${post.id}") { ${POST_FIELDS} } }`);
      expect(data!.post).toMatchObject({ version: 2, tags: { edges: [{ node: { name: 'Untagged' } }] } });
      await updates.release();
    });

    it('rejects a blank title, a too long title and a blank author with BAD_USER_INPUT', async () => {
      for (const input of [
        { title: '   ', content: 'c', author: 'a' },
        { title: 'x'.repeat(201), content: 'c', author: 'a' },
        { title: 'ok', content: 'c', author: '' },
      ]) {
        const result = await client.execute(`mutation($input: CreatePostInput!) { createPost(input: $input) { id } }`, { input });
        expect(result.data).toBeNull();
        expect(result.errors?.[0].extensions).toEqual({ code: 'BAD_USER_INPUT' });
      }
    });
  });

  describe('updatePost', () => {
    it('returns the updated post and delivers it on onPostUpdated', async () => {
      const updates = await subscribeUpdates();
      const post = await createPost('para editar');
      await updates.waitFor(1); // a tag padrão

      const { data, errors } = await updatePost({ id: post.id, title: 'editado' });

      expect(errors).toBeUndefined();
      expect(data!.updatePost).toMatchObject({ id: post.id, title: 'editado', content: 'oi', version: 3 });
      const [, event] = await updates.waitFor(2);
      expect(event.onPostUpdated).toMatchObject({ title: 'editado', version: 3, tags: { totalCount: 1 } });
      await updates.release();
    });

    it.each([
      ['a post that does not exist', { id: '00000000-0000-0000-0000-000000000000', title: 'x' }, 'NOT_FOUND', /não existe/],
      ['a malformed id', { id: 'nao-existe', title: 'x' }, 'BAD_USER_INPUT', /Invalid UUID/],
    ])('rejects %s', async (_, input, code, message) => {
      const result = await updatePost(input);

      expect(result.data).toBeNull();
      expect(result.errors?.[0]).toMatchObject({ message: expect.stringMatching(message), extensions: { code } });
    });

    it('rejects an update without changes and a blank title', async () => {
      const post = await createPost('sem mudanças');

      const noChanges = await updatePost({ id: post.id });
      const blank = await updatePost({ id: post.id, title: '   ' });

      expect(noChanges.errors?.[0]).toMatchObject({ message: expect.stringMatching(/sem mudanças/), extensions: { code: 'BAD_USER_INPUT' } });
      expect(blank.errors?.[0]).toMatchObject({ message: expect.stringMatching(/title não pode ser vazio/), extensions: { code: 'BAD_USER_INPUT' } });
    });
  });

  describe('onPostUpdated(postId) — filtering subscriptions', () => {
    it('a filtered subscriber only sees its post while the global one sees everything', async () => {
      const before = subscribers();
      const a = await createPost('A');
      const b = await createPost('B');
      const onlyA = await subscribeUpdates(a.id);
      const all = await subscribeUpdates();

      await updatePost({ id: a.id, title: 'A editado' });
      await updatePost({ id: b.id, content: 'B editado' });
      await updatePost({ id: a.id, content: 'A conteúdo' });

      const seenByAll = await all.waitFor(3);
      expect(seenByAll.map((e) => e.onPostUpdated.title)).toEqual(['A editado', 'B', 'A editado']);
      const seenByA = await onlyA.waitFor(2);
      expect(seenByA.map((e) => [e.onPostUpdated.id, e.onPostUpdated.content])).toEqual([
        [a.id, 'oi'],
        [a.id, 'A conteúdo'],
      ]);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(onlyA.received).toHaveLength(2);

      await all.release();
      await onlyA.release();
      expect(subscribers()).toBe(before);
    });

    it('two subscribers on the same topic share one stream, and one subscriber on the EventBus', async () => {
      const post = await createPost('compartilhado');
      const before = subscribers();
      const askedBefore = asked.length;
      const query = `subscription($postId: ID) { onPostUpdated(postId: $postId) { ${POST_FIELDS} } }`;

      const first = client.subscribe<{ onPostUpdated: any }>(query, { postId: post.id });
      await until(() => asked.length === askedBefore + 1);
      expect(subscribers()).toBe(before + 1);
      const second = client.subscribe<{ onPostUpdated: any }>(query, { postId: post.id });
      await until(() => asked.length === askedBefore + 2);

      // dois assinantes GraphQL, o mesmo critério: o `EventBus` continua enxergando um só
      expect(subscribers()).toBe(before + 1);

      await updatePost({ id: post.id, title: 'os dois veem' });
      const [a] = await first.waitFor(1);
      const [b] = await second.waitFor(1);
      expect(a.onPostUpdated.title).toBe('os dois veem');
      expect(b.onPostUpdated).toEqual(a.onPostUpdated);

      // e o stream só é desligado quando o último dos dois sai
      first.unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(subscribers()).toBe(before + 1);
      second.unsubscribe();
      await until(() => subscribers() === before);
    });

    it('unsubscribing removes the subscriber from the EventBus right away, filter or not', async () => {
      const before = subscribers();
      const filtered = await subscribeUpdates('00000000-0000-0000-0000-000000000000');
      const global = await subscribeUpdates();
      expect(subscribers()).toBe(before + 2);

      global.unsubscribe();
      await until(() => subscribers() === before + 1);
      filtered.unsubscribe();
      await until(() => subscribers() === before);
    });
  });

  describe('queries', () => {
    it('post(id) is null for an unknown id', async () => {
      const { data } = await client.execute(`{ post(id: "00000000-0000-0000-0000-000000000000") { id } }`);
      expect(data).toEqual({ post: null });
    });

    it('posts is a cursor connection: first page, then after = endCursor', async () => {
      const { data: page1 } = await client.execute(
        `{ posts(first: 1) { edges { cursor node { id } } pageInfo { hasNextPage hasPreviousPage endCursor } totalCount } }`,
      );
      expect(page1!.posts.edges).toHaveLength(1);
      expect(page1!.posts.pageInfo).toMatchObject({ hasNextPage: true, hasPreviousPage: false });
      expect(page1!.posts.totalCount).toBeGreaterThan(1);
      expect(page1!.posts.edges[0].cursor).toBe(page1!.posts.pageInfo.endCursor);

      const { data: page2 } = await client.execute(
        `query($after: String) { posts(first: 1, after: $after) { edges { node { id } } pageInfo { hasPreviousPage } } }`,
        { after: page1!.posts.pageInfo.endCursor },
      );
      expect(page2!.posts.edges[0].node.id).not.toBe(page1!.posts.edges[0].node.id);
      expect(page2!.posts.pageInfo.hasPreviousPage).toBe(true);
    });

    it('Post.tags is a cursor connection over the tags that came with the post', async () => {
      const updates = await subscribeUpdates();
      const post = await createPost('com tags');
      await updates.waitFor(1);
      await updates.release();

      const { data } = await client.execute(
        `{ post(id: "${post.id}") { tags(first: 1) { edges { cursor node { name } } pageInfo { hasNextPage endCursor } totalCount } } }`,
      );

      expect(data!.post.tags).toMatchObject({
        edges: [{ cursor: expect.any(String), node: { name: 'Untagged' } }],
        pageInfo: { hasNextPage: false },
        totalCount: 1,
      });
    });
  });
});
