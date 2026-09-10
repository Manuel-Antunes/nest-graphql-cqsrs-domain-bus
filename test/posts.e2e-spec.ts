import type { INestApplication } from '@nestjs/common';
import { MikroORM } from '@mikro-orm/core';
import { EventBus, type IEvent } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PostRequest } from '../src/application/shared/post-request';
import { SubscriptionBus } from '../src/cqsrs';
import { IdentityProvider } from '../src/domain/user/identity.provider';
import { AUTHOR_ROLE, User } from '../src/domain/user/user.entity';
import { CredentialId } from '../src/domain/user/vo/credential-id';
import { Email } from '../src/domain/user/vo/email';
import { GraphqlClient, until } from './support/graphql-client';

/**
 * A aplicação inteira — Express, Apollo, MikroORM (SQLite em memória, via `POSTS_DB` no config do
 * Vitest), CQRS — e um cliente GraphQL de verdade: HTTP para queries/mutations, graphql-ws para as
 * subscriptions. É o `scripts/poc-smoke.sh` **da versão Java** como teste, com o que ele tem de
 * interessante: a ordem entre command, evento e entrega na subscription, e o filtro por tópico.
 *
 * Este projeto tinha um script equivalente (`pnpm smoke`), e ele foi **apagado** em favor deste ficheiro.
 * Os dois percorriam o mesmo caminho, mas só um falha com nome e diff — e manter dois roteiros para o
 * mesmo caminho é garantir que um deles envelheça sem ninguém notar. Era o que estava a acontecer: o
 * script ainda mandava `author` dentro do `CreatePostInput`, campo que deixou de existir quando o autor
 * passou a vir da sessão.
 *
 * O que saiu com ele foi uma coisa só, e vale ser exato sobre qual: o script rodava contra o `dist/main`
 * **buildado**, numa porta de verdade e com banco em ficheiro. Aqui o `AppModule` sobe em processo, com
 * SQLite em memória — então **nada** verifica mais que o artefacto buildado arranca. O `pnpm build` diz
 * que ele compila e que os `.graphql` foram copiados; não diz que ele sobe. Quem quiser essa garantia de
 * volta põe um teste que faça `node dist/main` e espere o `/graphql` responder — é uma linha de
 * verificação diferente das outras, e é por isso que não está disfarçada aqui dentro.
 */
describe('posts (e2e)', () => {
  let app: INestApplication;
  let client: GraphqlClient;
  let eventBus: EventBus;
  let identities: IdentityProvider;
  /** O id da credencial do Better Auth — o que a sessão carrega. */
  let credentialId: string;
  /** Quantos perfis de domínio existem. É por ele que o teste vê o hook ter rodado. */
  const profileCount = () => app.get(MikroORM).em.fork().count(User);
  /** Quantos perfis existiam **entre** o sign-up e a concessão do papel. */
  let profilesAfterSignUp: number;
  /**
   * Quantos assinantes o `EventBus` tem. Cada *stream* do `SubscriptionBus` é exatamente um — o que
   * não é o mesmo que cada assinante GraphQL: assinantes com o mesmo critério dividem um stream.
   */
  const subscribers = () => eventBus.subject$.observers.length;
  /** Cada `subscriptionBus.subscribe(...)` — ou seja, cada assinante GraphQL, compartilhando ou não. */
  const asked: unknown[] = [];
  /** Tudo o que passou pelo `EventBus`, para inspecionar a request carimbada em cada evento. */
  const published: IEvent[] = [];

  /** A `PostRequest` carimbada num evento — o que o `AsyncContext` do @nestjs/cqrs propagou até ali. */
  const requestOf = (event: IEvent) => PostRequest.of(event as object);

  /**
   * `author` já não é um `String!`: é o `type Author`, resolvido à parte pelo `PostAuthorResolver`. Ele
   * entra em TODA selection deste ficheiro de propósito — inclusive nas subscriptions, que é o caminho
   * onde a view nasce do evento e a resolução precisa de uma consulta (e de um contexto de ORM dentro
   * da conexão WebSocket).
   */
  const POST_FIELDS = 'id title content author { id name email } createdAt updatedAt version tags(first: 5) { edges { cursor node { id name } } pageInfo { hasNextPage } totalCount }';
  const createPost = async (title: string, content = 'oi') => {
    const result = await client.execute(
      `mutation($input: CreatePostInput!) { createPost(input: $input) { ${POST_FIELDS} } }`,
      { input: { title, content } },
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
    /**
     * Escrever exige sessão **e** papel: `@Roles([AUTHOR_ROLE])` lê o `user.role` do Better Auth.
     * O sign-up cria a credencial sem papel; promovê-la a `author` é o que o realm do Keycloak fazia
     * na versão Axon.
     *
     * As duas linhas abaixo são o fluxo inteiro da identidade, e nenhuma delas toca o banco à mão:
     *
     * 1. o **sign-up** grava a credencial, e o `@AfterCreate('user')` do `UserProvisioningHooks`
     *    provisiona o perfil de domínio ali mesmo — antes de qualquer query (é o que
     *    `profileCount()` afirma logo abaixo);
     * 2. o `grantRole` da porta {@link IdentityProvider} concede o papel **no provedor**, e o
     *    `@AfterUpdate('user')` traz a promoção para cá.
     *
     * Antes isto era um `nativeUpdate` na tabela `authUser`, que atalhava o Better Auth inteiro — e
     * portanto não exercitava hook nenhum.
     */
    credentialId = await client.signUp('manuel@example.com', 'manuel');
    // Medido aqui de propósito: neste ponto só houve o sign-up. Um perfil que já exista foi criado
    // pelo hook de `user.create`, e não por nenhuma query.
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

  /**
   * A identidade ponta a ponta: Better Auth de verdade, hooks de verdade, e a porta
   * {@link IdentityProvider} sobre o adapter de verdade — nada de `nativeUpdate` na tabela de
   * credenciais. É o que prova que o provisionamento deixou de ser efeito colateral de uma query.
   */
  describe('identidade', () => {
    it('o perfil de domínio nasce no sign-up, e não na primeira query', () => {
      // A contagem foi tirada entre o sign-up e o `grantRole`: nenhuma query GraphQL tinha
      // acontecido, e o papel ainda não tinha mudado. Quem criou o perfil só pode ter sido o
      // `@AfterCreate('user')` do `UserProvisioningHooks`.
      expect(profilesAfterSignUp).toBe(1);
    });

    it('conceder o papel pela porta promove o perfil a Author', async () => {
      const em = app.get(MikroORM).em.fork();

      // `supersededBy: null` é o recorte de "ativo": a promoção deixa para trás o stream do Reader,
      // com o mesmo email. Sem ele, esta consulta pode achar justamente o que foi encerrado.
      const author = await em.findOneOrFail(User, {
        email: Email.parse('manuel@example.com'),
        supersededBy: null,
      });

      // O papel foi concedido no provedor (`grantRole`) e o `@AfterUpdate('user')` trouxe a
      // promoção: o stream do Reader foi encerrado e um do Author foi aberto no lugar.
      expect(author.canWritePosts()).toBe(true);
      expect(author.supersedes ?? null).not.toBeNull();
    });

    it('a identidade que a porta devolve é a mesma que a sessão carrega', async () => {
      const identity = await identities.findById(CredentialId.parse(credentialId));

      expect(identity).not.toBeNull();
      expect(identity!.email.value).toBe('manuel@example.com');
      expect(identity!.role).toBe(AUTHOR_ROLE);
    });
  });

  describe('createPost', () => {
    it('returns the post as it was born and delivers it on onPostCreated', async () => {
      const before = subscribers();
      const created = client.subscribe<{ onPostCreated: any }>(`subscription { onPostCreated { ${POST_FIELDS} } }`);
      await until(() => subscribers() === before + 1);

      const post = await createPost('  Nest + GraphQL  ');

      expect(post).toMatchObject({ title: 'Nest + GraphQL', content: 'oi', author: { name: 'manuel', email: 'manuel@example.com' } });
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

    it('propagates one request through the whole chain the mutation opened', async () => {
      const updates = await subscribeUpdates();
      const from = published.length;

      const post = await createPost('uma request só');
      await updates.waitFor(1); // a tag padrão, que é o fim da cadeia

      // `postId` é um value object: compara por valor, e não por identidade com o texto da resposta.
      const chain = published.slice(from).filter((event) => requestOf(event)?.postId.equals(post.id));
      const names = chain.map((event) => event.constructor.name);
      // o command da borda abre a cadeia; o da saga a fecha
      expect(names[0]).toBe('PostCreatedEvent');
      expect(names.at(-1)).toBe('PostUpdatedEvent');
      // e no meio, um TagCreatedEvent se a tag padrão ainda não existia neste banco
      expect(names.slice(1, -1).every((name) => name === 'TagCreatedEvent')).toBe(true);
      // handlers request-scoped diferentes, os da saga despachados fora da borda: o mesmo objeto em todos
      expect(new Set(chain.map(requestOf)).size).toBe(1);
      await updates.release();
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

  /**
   * `me`, a query polimórfica — o que a versão Axon demonstra com `me { ... on Author { … } }`.
   *
   * O que ela tem de interessante não é devolver o usuário: é o **casting** ser decidido pelo tipo que
   * saiu do banco, e não por uma claim do token. Os três testes abaixo são as três pontas disso — o
   * autor casa com `... on Author` e alcança os posts, o leitor não casa e nem vê o campo, e o anônimo
   * não chega a perguntar.
   */
  describe('me', () => {
    /** Um cliente que nunca autenticou, para provar que a query exige sessão. */
    let anonymous: GraphqlClient;
    /** Outro, que autentica mas não recebe papel nenhum — o `leitor@example.com` da versão Axon. */
    let readerClient: GraphqlClient;

    const ME = 'id name email __typename';

    beforeAll(async () => {
      anonymous = await GraphqlClient.for(app);
      readerClient = await GraphqlClient.for(app);
      // sem `grantRole`: o sign-up cria a credencial sem papel, e `Users.emptyFor(null)` faz disso um
      // Reader. É a diferença inteira entre os dois perfis deste teste.
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

    /**
     * O id do `me` é o do perfil **promovido**, e não o do stream que a promoção encerrou: o
     * `UserProvisioning` devolve o Author, e é ele que o `@CurrentUser()` entrega.
     */
    it('o id é o do perfil ativo de quem está logado', async () => {
      const { data } = await client.execute(`{ me { id } }`);

      const em = app.get(MikroORM).em.fork();
      const active = await em.findOneOrFail(User, {
        email: Email.parse('manuel@example.com'),
        supersededBy: null,
      });
      expect(data!.me.id).toBe(active.id.value);
    });

    it('um leitor é um Reader, e o fragmento de Author simplesmente não casa', async () => {
      const { data, errors } = await readerClient.execute(
        `{ me { ${ME} ... on Author { posts(first: 1) { totalCount } } } }`,
      );

      expect(errors).toBeUndefined();
      // Sem `posts` na resposta — e não um `posts` vazio. A ausência do campo é a resposta.
      expect(data!.me).toEqual({
        id: expect.any(String),
        name: 'leitor',
        email: 'leitor@example.com',
        __typename: 'Reader',
      });
    });

    it('sem sessão, o guard global recusa antes do resolver', async () => {
      const { data, errors } = await anonymous.execute(`{ me { id } }`);

      expect(data ?? null).toBeNull();
      // `UNAUTHENTICATED`, e não um erro de schema: quem recusou foi o guard, antes de o resolver
      // existir. `me: User!` pode ser não-nulo justamente porque este caminho nunca o alcança.
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
      // A ordem é decrescente por criação: o post que acabou de nascer é o primeiro da lista.
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

    /**
     * O campo é do `Author`, e o `Post` completo atravessa por ele — inclusive `tags`, que é outro
     * resolver de campo, aninhado. É o que prova que a view que sai do `Author.posts` é a mesma
     * `PostView` de sempre, e não uma meia-view.
     */
    it('os posts que saem por ali são Posts completos, tags inclusive', async () => {
      const updates = await subscribeUpdates();
      const post = await createPost('com tag, pelo me');
      await updates.waitFor(1); // a tag padrão, atribuída pela saga
      await updates.release();

      const { data } = await client.execute(
        `{ me { ... on Author { posts(first: 1) { edges { node { id version tags(first: 5) { edges { node { name } } totalCount } } } } } } }`,
      );

      expect(data!.me.posts.edges[0].node).toMatchObject({
        id: post.id,
        version: 2,
        tags: { edges: [{ node: { name: 'Untagged' } }], totalCount: 1 },
      });
    });

    /** Um leitor não tem posts porque não tem o campo — o tipo é a regra, não um filtro em runtime. */
    it('pedir Author.posts num Reader é um erro de schema, não uma lista vazia', async () => {
      const { errors } = await readerClient.execute(`{ me { ... on Reader { posts(first: 1) { totalCount } } } }`);

      expect(errors?.[0].message).toMatch(/posts/);
    });
  });


  /**
   * `Post.author` como `type Author` — a migração que transformou Post e Author num grafo.
   *
   * O `POST_FIELDS` deste ficheiro já pede `author { id name email }` em toda parte, subscriptions
   * incluídas, então a resolução está exercitada de ponta a ponta por todos os testes acima. O que
   * falta, e está aqui, é o que só este campo permite: **navegar**.
   */
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

    /**
     * O ciclo que a versão Axon documenta: `post → author → posts → author`. Ele só fecha porque
     * `Post.author` tem identidade — com o `String!` de antes, o grafo parava no nome.
     */
    it('dá para navegar do post para o autor e de volta para os posts dele', async () => {
      const post = await createPost('ida e volta');

      const { data, errors } = await client.execute(
        `{ post(id: "${post.id}") { id author { id posts(first: 3) { edges { node { id author { id } } } totalCount } } } }`,
      );

      expect(errors).toBeUndefined();
      const { author } = data!.post;
      expect(author.posts.totalCount).toBeGreaterThan(0);
      // o post recém-criado é o mais recente, e a ordem de `Author.posts` é decrescente
      expect(author.posts.edges[0].node.id).toBe(post.id);
      // e o autor alcançado pela volta é o mesmo de quem partimos
      expect(author.posts.edges[0].node.author.id).toBe(author.id);
    });

    /**
     * O autor é o **mesmo** que o `me` devolve: os dois saem do mesmo perfil de domínio, e nada no
     * caminho inventa um id.
     */
    it('o autor de um post e o `me` de quem o escreveu são o mesmo', async () => {
      const post = await createPost('o mesmo autor');

      const { data } = await client.execute(
        `{ me { id } post(id: "${post.id}") { author { id } } }`,
      );

      expect(data!.post.author.id).toBe(data!.me.id);
    });

    /**
     * A subscription é o caminho que **paga** uma consulta: a view nasce do payload do evento, que tem
     * `authorId` e `authorName` mas não e-mail. Este teste é o que prova que ela funciona dentro do
     * WebSocket — sem o contexto de ORM aberto no adapter, o cliente receberia `data: null`.
     */
    it('resolve dentro da conexão WebSocket de uma subscription', async () => {
      const updates = await subscribeUpdates();

      const post = await createPost('autor pela subscription');
      const [event] = await updates.waitFor(1);

      expect(event.onPostUpdated).toMatchObject({
        id: post.id,
        author: { id: expect.any(String), name: 'manuel', email: 'manuel@example.com' },
      });
      await updates.release();
    });

    /** Leitura anónima continua aberta, e chegar ao autor por ela também. */
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
