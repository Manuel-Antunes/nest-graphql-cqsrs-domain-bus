import type { INestApplication } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import { EventBus, type IEvent } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { TestSchemaModule } from '@nestposts/database/testing';
import { DefaultTagSeeder } from '@nestposts/migrator/seeders/default-tag.seeder';
import { AppModule } from '../src/app.module';
import { PostRequest } from '../src/application/shared/post-request';
import { SubscriptionBus } from '@nestposts/cqsrs';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';
import { AUTHOR_ROLE, Authorship } from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { GraphqlClient, until } from './support/graphql-client';

describe('posts (e2e)', () => {
  let app: INestApplication;
  let client: GraphqlClient;
  let eventBus: EventBus;
  let identities: IdentityProvider;
  let credentialId: string;
  const profileCount = () => app.get(MikroORM).em.fork().count(User);
  let profilesAfterSignUp: number;
  const subscribers = () => eventBus.subject$.observers.length;
  const asked: unknown[] = [];
  const published: IEvent[] = [];

  const requestOf = (event: IEvent) => PostRequest.of(event as object);

  const POST_FIELDS = 'id title content author { id name email } createdAt updatedAt version tags(first: 5) { edges { cursor node { id name } } pageInfo { hasNextPage } totalCount }';
  const createPost = async (title: string, content = 'oi') => {
    const result = await client.execute(
      `mutation($input: CreatePostInput!) { createPost(input: $input) { ${POST_FIELDS} } }`,
      { input: { title, content } },
    );
    expect(result.errors).toBeUndefined();
    return result.data!.createPost;
  };
  const isComplete = (id: string) =>
    published.some(
      (event) => event.constructor.name === 'PostCreatedEvent' && (event as { postId?: string }).postId === id,
    );
  const createCompletePost = async (title: string, content = 'oi') => {
    const post = await createPost(title, content);
    await until(() => isComplete(post.id));
    return post;
  };
  const subscribeCreated = async () => {
    const before = subscribers();
    const collector = client.subscribe<{ onPostCreated: any }>(
      `subscription { onPostCreated { ${POST_FIELDS} } }`,
    );
    await until(() => subscribers() === before + 1);
    const release = async () => {
      collector.unsubscribe();
      await until(() => subscribers() === before);
    };
    return Object.assign(collector, { release });
  };
  const updatePost = (input: { id: string; title?: string | null; content?: string | null }) =>
    client.execute(`mutation($input: UpdatePostInput!) { updatePost(input: $input) { ${POST_FIELDS} } }`, { input });
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
    const module = await Test.createTestingModule({ imports: [AppModule, TestSchemaModule.forRoot()] }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    await app.get(MikroORM).seeder.seed(DefaultTagSeeder);
    client = await GraphqlClient.for(app);
    credentialId = await client.signUp('manuel@example.com', 'manuel');
    profilesAfterSignUp = await profileCount();
    identities = app.get(IdentityProvider);
    await identities.grantRole(CredentialId.parse(credentialId), AUTHOR_ROLE);
    eventBus = app.get(EventBus);
    eventBus.subscribe((event) => published.push(event));
    app.get(SubscriptionBus).subscriptions$.subscribe((subscription) => asked.push(subscription));
  });

  afterAll(async () => {
    await client.dispose();
    await app.close();
  });

  describe('identidade', () => {
    it('o perfil de domínio nasce no sign-up, e não na primeira query', () => {
      expect(profilesAfterSignUp).toBe(1);
    });

    it('conceder o papel pela porta promove o mesmo perfil, sem abrir outro', async () => {
      const em = app.get(MikroORM).em.fork();

      const author = await em.findOneOrFail(User, { email: Email.parse('manuel@example.com') });

      expect(author.hasRole(AUTHOR_ROLE)).toBe(true);
      expect(await em.findOne(Authorship, { user: author.id })).not.toBeNull();
      expect(await em.count(User)).toBe(profilesAfterSignUp);
    });

    it('a identidade que a porta devolve é a mesma que a sessão carrega', async () => {
      const identity = await identities.findById(CredentialId.parse(credentialId));

      expect(identity).not.toBeNull();
      expect(identity!.email.value).toBe('manuel@example.com');
      expect(identity!.role).toBe(AUTHOR_ROLE);
    });
  });

  describe('createPost', () => {
    it('answers pre-created: version 1, no tags, because the tagging step left the write path', async () => {
      const post = await createPost('  Nest + GraphQL  ');

      expect(post).toMatchObject({
        title: 'Nest + GraphQL',
        content: 'oi',
        version: 1,
        tags: { edges: [], totalCount: 0 },
        author: { name: 'manuel', email: 'manuel@example.com' },
      });
      expect(post.createdAt).toBe(post.updatedAt);
    });

    it('delivers the post COMPLETE on onPostCreated, once the first tag comes back', async () => {
      const created = await subscribeCreated();

      const post = await createPost('com tag padrão');
      const event = await created.waitForMatch((received) => received.onPostCreated?.id === post.id);

      expect(event.onPostCreated).toMatchObject({
        id: post.id,
        title: 'com tag padrão',
        version: 2,
        tags: { edges: [{ node: { name: 'Untagged' } }], totalCount: 1 },
      });
      const { data } = await client.execute(`{ post(id: "${post.id}") { ${POST_FIELDS} } }`);
      expect(data!.post).toMatchObject({ version: 2, tags: { edges: [{ node: { name: 'Untagged' } }] } });
      await created.release();
    });

    it('propagates one request through the whole chain the mutation opened', async () => {
      const from = published.length;

      const post = await createCompletePost('uma request só');

      const chain = published.slice(from).filter((event) => requestOf(event)?.postId.equals(post.id));
      expect(chain.map((event) => event.constructor.name)).toEqual([
        'PostPreCreatedEvent',
        'PostCreatedEvent',
      ]);
      expect(new Set(chain.map(requestOf)).size).toBe(1);
    });

    it('rejects a blank title and a too long title with BAD_USER_INPUT', async () => {
      for (const input of [
        { title: '   ', content: 'c' },
        { title: 'x'.repeat(201), content: 'c' },
      ]) {
        const result = await client.execute(`mutation($input: CreatePostInput!) { createPost(input: $input) { id } }`, { input });
        expect(result.data).toBeNull();
        expect(result.errors?.[0].extensions).toEqual({ code: 'BAD_USER_INPUT' });
      }
    });
  });

  describe('updatePost', () => {
    it('returns the updated post and delivers it on onPostUpdated', async () => {
      const post = await createCompletePost('para editar');
      const updates = await subscribeUpdates();

      const { data, errors } = await updatePost({ id: post.id, title: 'editado' });

      expect(errors).toBeUndefined();
      expect(data!.updatePost).toMatchObject({ id: post.id, title: 'editado', content: 'oi', version: 3 });
      const [event] = await updates.waitFor(1);
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
      const a = await createCompletePost('A');
      const b = await createCompletePost('B');
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

      expect(subscribers()).toBe(before + 1);

      await updatePost({ id: post.id, title: 'os dois veem' });
      const [a] = await first.waitFor(1);
      const [b] = await second.waitFor(1);
      expect(a.onPostUpdated.title).toBe('os dois veem');
      expect(b.onPostUpdated).toEqual(a.onPostUpdated);

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
      const post = await createCompletePost('com tags');

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

  describe('me', () => {
    let anonymous: GraphqlClient;
    let readerClient: GraphqlClient;

    const ME = 'id name email __typename';

    beforeAll(async () => {
      anonymous = await GraphqlClient.for(app);
      readerClient = await GraphqlClient.for(app);
      await readerClient.signUp('leitor@example.com', 'leitor');
    });

    afterAll(async () => {
      await anonymous.dispose();
      await readerClient.dispose();
    });

    it('quem tem papel de autor é um Author, e o fragmento casa', async () => {
      const { data, errors } = await client.execute(`{ me { ${ME} } }`);

      expect(errors).toBeUndefined();
      expect(data!.me).toMatchObject({
        name: 'manuel',
        email: 'manuel@example.com',
        __typename: 'Author',
      });
      expect(data!.me.id).toEqual(expect.any(String));
    });

    it('o id é o do perfil ativo de quem está logado', async () => {
      const { data } = await client.execute(`{ me { id } }`);

      const em = app.get(MikroORM).em.fork();
      const active = await em.findOneOrFail(User, { email: Email.parse('manuel@example.com') });
      expect(data!.me.id).toBe(active.id.value);
    });

    it('quem não é autor é um User, e o fragmento de Author simplesmente não casa', async () => {
      const { data, errors } = await readerClient.execute(
        `{ me { ${ME} ... on Author { posts(first: 1) { totalCount } } } }`,
      );

      expect(errors).toBeUndefined();
      expect(data!.me).toEqual({
        id: expect.any(String),
        name: 'leitor',
        email: 'leitor@example.com',
        __typename: 'User',
      });
    });

    it('sem sessão, o guard global recusa antes do resolver', async () => {
      const { data, errors } = await anonymous.execute(`{ me { id } }`);

      expect(data ?? null).toBeNull();
      expect(errors?.[0]).toMatchObject({
        message: 'Unauthorized',
        path: ['me'],
        extensions: { code: 'UNAUTHENTICATED' },
      });
    });

    it('Author.posts é uma cursor connection, do mais recente para o mais antigo', async () => {
      const recente = await createPost('o mais recente de todos');

      const { data, errors } = await client.execute(
        `{ me { ... on Author { posts(first: 2) { edges { cursor node { id title author { name } } } pageInfo { hasNextPage hasPreviousPage endCursor } totalCount } } } }`,
      );

      expect(errors).toBeUndefined();
      const page = data!.me.posts;
      expect(page.edges[0].node).toMatchObject({ id: recente.id, title: 'o mais recente de todos', author: { name: 'manuel' } });
      expect(page.edges).toHaveLength(2);
      expect(page.pageInfo).toMatchObject({ hasNextPage: true, hasPreviousPage: false });
      expect(page.totalCount).toBeGreaterThan(2);
      expect(page.edges[1].cursor).toBe(page.pageInfo.endCursor);
    });

    it('o endCursor de uma página é o after da seguinte', async () => {
      const { data: first } = await client.execute(
        `{ me { ... on Author { posts(first: 1) { edges { node { id } } pageInfo { endCursor } } } } }`,
      );

      const { data: second } = await client.execute(
        `query($after: String) { me { ... on Author { posts(first: 1, after: $after) { edges { node { id } } pageInfo { hasPreviousPage } } } } }`,
        { after: first!.me.posts.pageInfo.endCursor },
      );

      expect(second!.me.posts.edges[0].node.id).not.toBe(first!.me.posts.edges[0].node.id);
      expect(second!.me.posts.pageInfo.hasPreviousPage).toBe(true);
    });

    it('os posts que saem por ali são Posts completos, tags inclusive', async () => {
      const post = await createCompletePost('com tag, pelo me');

      const { data } = await client.execute(
        `{ me { ... on Author { posts(first: 1) { edges { node { id version tags(first: 5) { edges { node { name } } totalCount } } } } } } }`,
      );

      expect(data!.me.posts.edges[0].node).toMatchObject({
        id: post.id,
        version: 2,
        tags: { edges: [{ node: { name: 'Untagged' } }], totalCount: 1 },
      });
    });

    it('pedir Author.posts em quem não é autor é um erro de schema, não uma lista vazia', async () => {
      const { errors } = await readerClient.execute(`{ me { ... on User { posts(first: 1) { totalCount } } } }`);

      expect(errors?.[0].message).toMatch(/posts/);
    });
  });

  describe('Post.author', () => {
    it('é um Author de verdade, com os campos da interface User', async () => {
      const post = await createPost('para ver o autor');

      const { data, errors } = await client.execute(
        `{ post(id: "${post.id}") { author { __typename id name email } } }`,
      );

      expect(errors).toBeUndefined();
      expect(data!.post.author).toMatchObject({
        __typename: 'Author',
        name: 'manuel',
        email: 'manuel@example.com',
      });
    });

    it('dá para navegar do post para o autor e de volta para os posts dele', async () => {
      const post = await createPost('ida e volta');

      const { data, errors } = await client.execute(
        `{ post(id: "${post.id}") { id author { id posts(first: 3) { edges { node { id author { id } } } totalCount } } } }`,
      );

      expect(errors).toBeUndefined();
      const { author } = data!.post;
      expect(author.posts.totalCount).toBeGreaterThan(0);
      expect(author.posts.edges[0].node.id).toBe(post.id);
      expect(author.posts.edges[0].node.author.id).toBe(author.id);
    });

    it('o autor de um post e o `me` de quem o escreveu são o mesmo', async () => {
      const post = await createPost('o mesmo autor');

      const { data } = await client.execute(
        `{ me { id } post(id: "${post.id}") { author { id } } }`,
      );

      expect(data!.post.author.id).toBe(data!.me.id);
    });

    it('resolve dentro da conexão WebSocket de uma subscription', async () => {
      const created = await subscribeCreated();

      const post = await createPost('autor pela subscription');
      const event = await created.waitForMatch((received) => received.onPostCreated?.id === post.id);

      expect(event.onPostCreated).toMatchObject({
        id: post.id,
        author: { id: expect.any(String), name: 'manuel', email: 'manuel@example.com' },
      });
      await created.release();
    });

    it('uma leitura anónima alcança o autor', async () => {
      const post = await createPost('visível a todos');
      const anonymous = await GraphqlClient.for(app);

      const { data, errors } = await anonymous.execute(
        `{ post(id: "${post.id}") { author { name } } }`,
      );

      expect(errors).toBeUndefined();
      expect(data!.post.author.name).toBe('manuel');
      await anonymous.dispose();
    });
  });

});
