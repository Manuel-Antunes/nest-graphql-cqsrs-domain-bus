import type { ResultOf } from '@graphql-typed-document-node/core';
import { print } from 'graphql';

import type { GraphQlAnswer } from '../fixtures/test';
import { expect, signInThroughTheForm, test } from '../fixtures/test';
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
     * Each service only ingests what ANOTHER one produced, and the inbox is where that is recorded by
     * name.
     *
     * The inbox is the transport's, one table in its own schema for every service, so its rows are
     * told apart by what they are and who sent them: a `posts.PostCreated` from tagging is what
     * posts-api ingested, any other `posts.*` from posts-api is what tagging did, and a
     * `notifications.*` is the notificator's — from posts-api (a post is live) and from the web, whose
     * Better Auth sent the verification emails the accounts were created with. The assertion is about
     * EVERY row: a service that ingested its own echo would leave one that fits none of the three.
     */
    test('cada serviço só ingere o que o outro produziu: a marca de origem corta o laço', async ({
      postsStore,
    }) => {
      const inbox =
        (await until(async () => {
          const rows = await postsStore.inbox();
          return rows.some(
            (row) =>
              row.message_type.startsWith('notifications.') &&
              row.origin === 'posts-api',
          )
            ? rows
            : undefined;
        }, 20_000)) ?? (await postsStore.inbox());
      const ingestedByPosts = inbox.filter(
        (row) =>
          row.message_type.startsWith(CREATED) && row.origin === 'tagging',
      );
      const ingestedByTagging = inbox.filter(
        (row) =>
          row.message_type.startsWith('posts.') && row.origin === 'posts-api',
      );
      const deliveredByNotificator = inbox.filter((row) =>
        row.message_type.startsWith('notifications.'),
      );

      expect(
        ingestedByPosts.length +
          ingestedByTagging.length +
          deliveredByNotificator.length,
      ).toBe(inbox.length);
      expect(
        ingestedByPosts.length,
        'a posts-api não ingeriu nada',
      ).toBeGreaterThan(0);
      expect(
        ingestedByTagging.length,
        'o tagging não ingeriu nada',
      ).toBeGreaterThan(0);
      expect(
        deliveredByNotificator.length,
        'the notificator ingested nothing',
      ).toBeGreaterThan(0);
      expect(
        [...new Set(deliveredByNotificator.map((row) => row.origin))].sort(),
      ).toEqual(['posts-api', 'web']);
      expect(
        deliveredByNotificator.every((row) =>
          row.message_type.startsWith('notifications.NotificationReceived'),
        ),
      ).toBe(true);
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
     * The tenant is an organization, and only its members may name it: a fresh author creates one,
     * and the browser names it in capitals to prove the header is normalised on the way.
     */
    test('o x-tenant do navegador chega aos dois processos, e volta na decisão do outro', async ({
      browser,
      freshAccount,
      postsStore,
      messages,
    }) => {
      const wire = messages('nestposts.e2e.tenant-spy');
      await wire.watch('posts.#');
      const author = await freshAccount('Tenanted');
      await postsStore.promoteToAuthor(author.credentialId);
      const slug = `acme-${Date.now()}`;

      const context = await browser.newContext({
        extraHTTPHeaders: { 'x-tenant': slug.toUpperCase() },
      });
      const page = await context.newPage();
      await signInThroughTheForm(page, author);
      await expect(page.getByText(author.email).first()).toBeVisible();
      const organization = await page.evaluate(
        async ([name, organizationSlug]) => {
          const response = await fetch('/api/auth/organization/create', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, slug: organizationSlug }),
          });
          return response.status;
        },
        [`Acme ${slug}`, slug] as const,
      );
      expect(organization).toBe(200);

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
      ).toBe(slug);
      expect(
        completed?.['x-tenant'],
        'o tagging republicou sob o contexto que recebeu: o tenant atravessou os dois processos',
      ).toBe(slug);
      expect(
        completed?.['cqrs-transport-origin'],
        'e mesmo carregando o tenant do outro serviço, a autoria continua sendo a sua',
      ).toBe('tagging');
      expect(
        await postsStore.query(
          `select id from "tenant_${slug}".posts where id = ?`,
          created.data?.createPost.id,
        ),
        'the post was written in the organization’s own schema',
      ).toHaveLength(1);

      await context.close();
    });
  });
