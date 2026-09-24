import type { ResultOf } from '@graphql-typed-document-node/core';
import { print } from 'graphql';

import type { GraphQlAnswer } from '../fixtures/test';
import { expect, test } from '../fixtures/test';
import { graphql } from '../gql';
import { until } from '../support/posts-api';

const PRE_CREATED = 'posts.PostPreCreated';
const CREATED = 'posts.PostCreated';
const UPDATED = 'posts.PostUpdated';

const stripVersion = (messageType: string): string => messageType.split('#')[0];

const EditSagaPost = graphql(`
  mutation EditSagaPost($id: ID!) {
    updatePost(input: { id: $id, title: "Saga editada" }) {
      version
    }
  }
`);

const CreateCorrelatedPost = graphql(`
  mutation CreateCorrelatedPost($title: String!) {
    createPost(input: { title: $title, content: "oi" }) {
      id
    }
  }
`);

const CreateTenantPost = graphql(`
  mutation CreateTenantPost {
    createPost(input: { title: "Com tenant", content: "oi" }) {
      id
    }
  }
`);

type TenantPostAnswer = GraphQlAnswer<ResultOf<typeof CreateTenantPost>>;

/**
 * **A saga coreografada, vista do navegador** — e conferida onde o navegador não chega.
 *
 * O post é escrito no formulário, a mutation responde a versão 1, e a versão 2 chega pela
 * subscription depois de OUTRO PROCESSO decidir a tag. Essa é a parte que a tela mostra. O resto —
 * o estado durável dos dois serviços, os dois inboxes, a idempotência de uma reentrega e os headers
 * AMQP — é o que sustenta a afirmação, e um teste do Playwright é Node o bastante para conferir.
 */
test.describe
  .serial('a saga coreografada, escrita no navegador', () => {
    let postId: string;

    test('o formulário responde PRÉ-CRIADO: versão 1, sem tag', async ({
      page,
      accounts,
      signIn,
    }) => {
      await signIn(accounts.author);
      await page.goto('/posts/new');

      await page.getByLabel('Título').fill('Saga pelo navegador');
      await page.getByLabel('Conteúdo').fill('escrito no formulário');
      await page.getByRole('button', { name: 'Publicar' }).click();

      await expect(
        page.getByText('Resposta da mutation — versão 1'),
      ).toBeVisible();

      const href = await page
        .getByRole('link', { name: 'Abrir o post' })
        .getAttribute('href');
      postId = href?.split('/').pop() as string;
      expect(postId).toMatch(/^[0-9a-f-]{36}$/);
    });

    /**
     * **Recarrega até ver**, e isso não é frouxidão: a página é renderizada no servidor a cada pedido e
     * não assina nada, então o que ela mostra é o estado no instante em que foi pedida. A decisão do
     * outro serviço chega depois — 300ms sobre Inngest, ~1s sobre RabbitMQ — e quem navegou antes disso
     * fica com a versão 1 na tela para sempre. Um `toBeVisible` sozinho não espera pelo sistema, espera
     * pelo DOM de um render que já aconteceu; é por isso que ele passava num transporte e falhava no
     * outro, que é a pior forma de uma asserção existir.
     */
    test('a página do post alcança a versão 2, com a tag que o outro serviço decidiu', async ({
      page,
    }) => {
      await expect(async () => {
        await page.goto(`/posts/${postId}`);
        await expect(page.getByText('Untagged').first()).toBeVisible({
          timeout: 1_000,
        });
      }).toPass({ timeout: 30_000 });
    });

    test('o estado durável de cada serviço é exatamente o esperado', async ({
      postsStore,
      taggingStore,
    }) => {
      const post = await postsStore.post(postId);

      expect(post).toMatchObject({ version: 2 });
      expect(
        post?.published_at,
        'um post completo está publicado',
      ).not.toBeNull();
      expect(await postsStore.tagsOf(postId)).toEqual(['Untagged']);
      expect(
        (await taggingStore.streamOf(postId)).map(stripVersion),
        'a fila não é a fonte: o event store dele é',
      ).toEqual([PRE_CREATED, CREATED]);
    });

    /**
     * Cada serviço só ingere o que o OUTRO produziu, e o inbox é onde isso fica registrado com nome.
     *
     * A asserção é sobre TODAS as linhas e não sobre uma: é o que a marca de origem promete — um evento
     * que este serviço produziu e recebeu de volta é descartado — e o que continua verdade por mais
     * posts que os outros specs escrevam. A contagem "uma linha por mensagem" é do teste de reentrega,
     * que a mede pelo identificador.
     *
     * The `posts` schema's inbox is shared with `notificator`, which lives in that schema too, so its
     * rows are split by namespace: `posts.*` is what posts-api ingested, `notifications.*` is what the
     * notificator did — and each side only ever ingests what the other produced.
     */
    test('cada serviço só ingere o que o outro produziu: a marca de origem corta o laço', async ({
      postsStore,
      taggingStore,
    }) => {
      const ingestedInPosts =
        (await until(async () => {
          const rows = await postsStore.inbox();
          return rows.some((row) =>
            row.message_type.startsWith('notifications.'),
          )
            ? rows
            : undefined;
        }, 20_000)) ?? (await postsStore.inbox());
      const ingestedHere = ingestedInPosts.filter((row) =>
        row.message_type.startsWith('posts.'),
      );
      const deliveredByNotificator = ingestedInPosts.filter((row) =>
        row.message_type.startsWith('notifications.'),
      );
      const ingestedThere = await taggingStore.inbox();

      expect(ingestedHere.length + deliveredByNotificator.length).toBe(
        ingestedInPosts.length,
      );
      expect(
        ingestedHere.length,
        'a posts-api não ingeriu nada',
      ).toBeGreaterThan(0);
      expect([...new Set(ingestedHere.map((row) => row.origin))]).toEqual([
        'tagging',
      ]);
      expect(
        ingestedHere.every((row) => row.message_type.startsWith(CREATED)),
      ).toBe(true);

      expect(
        deliveredByNotificator.length,
        'the notificator ingested nothing',
      ).toBeGreaterThan(0);
      expect([
        ...new Set(deliveredByNotificator.map((row) => row.origin)),
      ]).toEqual(['posts-api']);
      expect(
        deliveredByNotificator.every((row) =>
          row.message_type.startsWith('notifications.NotificationReceived'),
        ),
      ).toBe(true);

      expect(
        ingestedThere.length,
        'o tagging não ingeriu nada',
      ).toBeGreaterThan(0);
      expect([...new Set(ingestedThere.map((row) => row.origin))]).toEqual([
        'posts-api',
      ]);
    });

    test('reentregar a MESMA mensagem não produz uma segunda decisão', async ({
      messages,
      taggingStore,
    }) => {
      const ingested = await taggingStore.eventOf(postId, PRE_CREATED);

      const accepted = await messages('nestposts.e2e.redelivery').redeliver(
        ingested,
        `${PRE_CREATED}.${postId}`,
        `postId=${postId}`,
      );

      expect(
        accepted,
        'o transporte não endereçou a reentrega: o binding mudou',
      ).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 4000));
      expect(
        await taggingStore.countEvents(postId, CREATED),
        'inbox e agregado seguraram a duplicata',
      ).toBe(1);
      expect(await taggingStore.inboxRowsFor(ingested.identifier)).toBe(1);
    });

    test('o canal de RÉPLICA mantém o stream do Post completo no outro serviço', async ({
      accounts,
      signIn,
      executeGraphql,
      taggingStore,
    }) => {
      await signIn(accounts.author);

      const edited = await executeGraphql(EditSagaPost, { id: postId });

      expect(edited.errors, JSON.stringify(edited.errors)).toBeUndefined();
      expect(edited.data?.updatePost.version).toBe(3);

      const replicated = await until(async () => {
        const stream = (await taggingStore.streamOf(postId)).map(stripVersion);
        return stream.includes(UPDATED) ? stream : undefined;
      }, 20_000);

      expect(
        replicated,
        'ninguém reage ao PostUpdated no tagging — ele está lá para a próxima decisão não ser tomada contra meia história',
      ).toEqual([PRE_CREATED, CREATED, UPDATED]);
    });
  });

test.describe
  .serial('o que a request carrega atravessa os dois processos', () => {
    test('uma request, um correlation id', async ({
      accounts,
      signIn,
      executeGraphql,
      messages,
    }) => {
      const wire = messages('nestposts.e2e.correlation-spy');
      await wire.watch('posts.#');
      await signIn(accounts.author);

      const created = await executeGraphql(CreateCorrelatedPost, {
        title: 'Uma request só',
      });
      expect(created.errors, JSON.stringify(created.errors)).toBeUndefined();
      const seen = await wire.of(created.data?.createPost.id as string);

      expect(seen.size, 'o transporte não trouxe os dois eventos da saga').toBe(
        2,
      );
      const [born, completed] = ['PostPreCreated', 'PostCreated'].map(
        (name) => seen.get(name)?.headers,
      );
      expect(born?.['cqrs-transport-origin']).toBe('posts-api');
      expect(
        completed?.['cqrs-transport-origin'],
        'o segundo evento é decisão do outro processo',
      ).toBe('tagging');
      expect(
        completed?.['cqrs-transport-correlation-id'],
        'a saga inteira sob um correlation id só',
      ).toBe(born?.['cqrs-transport-correlation-id']);
    });

    /**
     * O `x-tenant` sai do NAVEGADOR — `extraHTTPHeaders` no contexto — atravessa o proxy do Next, a
     * mutation, o broker, o outro processo, e volta nos headers da decisão dele. É o caminho inteiro da
     * propagação, com um cliente de verdade em cada ponta.
     *
     * O `fetch` é do navegador porque o contexto com o header é dele, mas a query que ele manda é a
     * mesma tipada do resto: impressa aqui, no Node, e passada como argumento.
     */
    test('o x-tenant do navegador chega aos dois processos, e volta na decisão do outro', async ({
      browser,
      accounts,
      messages,
    }) => {
      const wire = messages('nestposts.e2e.tenant-spy');
      await wire.watch('posts.#');

      const context = await browser.newContext({
        extraHTTPHeaders: { 'x-tenant': 'Acme' },
      });
      const page = await context.newPage();
      await page.goto('/login');
      await page.getByLabel('E-mail').fill(accounts.author.email);
      await page.getByLabel('Senha').fill(accounts.author.password);
      await page.getByRole('button', { name: 'Entrar' }).click();
      await expect(page.getByText(accounts.author.email).first()).toBeVisible();

      const created = await page.evaluate<TenantPostAnswer, string>(
        async (query) => {
          const response = await fetch('/api/graphql', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query }),
          });
          return response.json() as Promise<TenantPostAnswer>;
        },
        print(CreateTenantPost),
      );
      expect(created.errors, JSON.stringify(created.errors)).toBeUndefined();
      const seen = await wire.of(created.data?.createPost.id as string);

      const [born, completed] = ['PostPreCreated', 'PostCreated'].map(
        (name) => seen.get(name)?.headers,
      );
      expect(
        born?.['x-tenant'],
        'o header do navegador entrou na PostRequest',
      ).toBe('acme');
      expect(
        completed?.['x-tenant'],
        'o tagging republicou sob o contexto que recebeu: o tenant atravessou os dois processos',
      ).toBe('acme');
      expect(
        completed?.['cqrs-transport-origin'],
        'e mesmo carregando o tenant do outro serviço, a autoria continua sendo a sua',
      ).toBe('tagging');

      await context.close();
    });
  });
