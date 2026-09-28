import { expect, test } from '../fixtures/test';
import { PostEvent } from '../model/post';
import { Poll } from '../support/poll';

const { PRE_CREATED, CREATED, UPDATED } = PostEvent;

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
      app,
      accounts,
      authentication,
      publishing,
    }) => {
      await authentication.signIn(accounts.author);

      postId = await publishing.publishInTheForm({
        title: 'Saga pelo navegador',
        content: 'escrito no formulário',
      });

      await expect(app.newPost.answeredVersion(1)).toBeVisible();
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
      app,
    }) => {
      const post = app.post(postId);

      await post.reopenUntil(
        async () => {
          await expect(post.tag('Untagged')).toBeVisible({ timeout: 1_000 });
        },
        { timeout: 30_000 },
      );
    });

    test('o estado durável de cada serviço é exatamente o esperado', async ({
      postRecords,
      eventLog,
    }) => {
      const post = await postRecords.find(postId);

      expect(post).toMatchObject({ version: 2 });
      expect(
        post?.published_at,
        'um post completo está publicado',
      ).not.toBeNull();
      expect(await postRecords.tagsOf(postId)).toEqual(['Untagged']);
      expect(
        await eventLog.streamOf(postId),
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
     * A row whose consumer names a group as well as a service (`posts-api/notifications`) is not an
     * ingestion but a streaming processing group's delivery, inside the service that published or
     * ingested the event, and it is set apart before the three are counted.
     */
    test('cada serviço só ingere o que o outro produziu: a marca de origem corta o laço', async ({
      inbox,
    }) => {
      const rows = await inbox.onceAny(
        (row) =>
          row.message_type.startsWith('notifications.') &&
          row.origin === 'posts-api',
        20_000,
      );
      const deliveredToProcessingGroups = rows.filter((row) =>
        row.consumer.includes('/'),
      );
      const ingested = rows.filter((row) => !row.consumer.includes('/'));
      const ingestedByPosts = ingested.filter(
        (row) =>
          row.message_type.startsWith(CREATED) && row.origin === 'tagging',
      );
      const ingestedByTagging = ingested.filter(
        (row) =>
          row.message_type.startsWith('posts.') && row.origin === 'posts-api',
      );
      const deliveredByNotificator = ingested.filter((row) =>
        row.message_type.startsWith('notifications.'),
      );

      expect(
        ingestedByPosts.length +
          ingestedByTagging.length +
          deliveredByNotificator.length,
      ).toBe(ingested.length);
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
      expect(
        [
          ...ingestedByPosts.map((row) => row.consumer === 'posts-api'),
          ...ingestedByTagging.map((row) => row.consumer === 'tagging'),
          ...deliveredByNotificator.map(
            (row) => row.consumer === 'notificator',
          ),
        ].every(Boolean),
        'each row is in the inbox of the service that ingested it',
      ).toBe(true);
      expect(
        [...new Set(deliveredToProcessingGroups.map((row) => row.consumer))],
        "the only streaming group is posts-api's notifications",
      ).toEqual(['posts-api/notifications']);
    });

    test('reentregar a MESMA mensagem não produz uma segunda decisão', async ({
      wire,
      eventLog,
      inbox,
    }) => {
      const ingested = await eventLog.eventOf(postId, PRE_CREATED);

      const accepted = await wire('nestposts.e2e.redelivery').redeliver(
        ingested,
        `${PRE_CREATED}.${postId}`,
        `postId=${postId}`,
      );

      expect(
        accepted,
        'o transporte não endereçou a reentrega: o binding mudou',
      ).toBe(true);
      await Poll.pause(4_000);
      expect(
        await eventLog.count(postId, CREATED),
        'inbox e agregado seguraram a duplicata',
      ).toBe(1);
      expect(await inbox.rowsFor(ingested.identifier)).toBe(1);
    });

    test('o canal de RÉPLICA mantém o stream do Post completo no outro serviço', async ({
      accounts,
      authentication,
      publishing,
      eventLog,
    }) => {
      await authentication.signIn(accounts.author);

      const version = await publishing.retitle(postId, 'Saga editada');

      expect(version).toBe(3);
      expect(
        await eventLog.whenStreamHas(postId, UPDATED, 20_000),
        'ninguém reage ao PostUpdated no tagging — ele está lá para a próxima decisão não ser tomada contra meia história',
      ).toEqual([PRE_CREATED, CREATED, UPDATED]);
    });
  });

test.describe
  .serial('o que a request carrega atravessa os dois processos', () => {
    test('uma request, um correlation id', async ({
      accounts,
      authentication,
      publishing,
      wire,
    }) => {
      const spy = wire('nestposts.e2e.correlation-spy');
      await spy.watch('posts.#');
      await authentication.signIn(accounts.author);

      const postId = await publishing.publishThroughTheApi('Uma request só');
      const seen = await spy.of(postId);

      expect(seen.size, 'o transporte não trouxe os dois eventos da saga').toBe(
        2,
      );
      const born = seen.get('PostPreCreated');
      const completed = seen.get('PostCreated');
      expect(born?.origin).toBe('posts-api');
      expect(
        completed?.origin,
        'o segundo evento é decisão do outro processo',
      ).toBe('tagging');
      expect(
        completed?.correlationId,
        'a saga inteira sob um correlation id só',
      ).toBe(born?.correlationId);
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
      registration,
      postRecords,
      wire,
      visitors,
    }) => {
      const spy = wire('nestposts.e2e.tenant-spy');
      await spy.watch('posts.#');
      const author = await registration.freshAuthor('Tenanted');
      const slug = `acme-${Date.now()}`;

      const tenanted = await visitors.arrive({
        extraHTTPHeaders: { 'x-tenant': slug.toUpperCase() },
      });
      await tenanted.authentication.signIn(author);
      await tenanted.organizations.createThroughTheApi(`Acme ${slug}`, slug);

      const postId =
        await tenanted.publishing.publishThroughTheApi('Com tenant');
      const seen = await spy.of(postId);

      const born = seen.get('PostPreCreated');
      const completed = seen.get('PostCreated');
      expect(born?.tenant, 'o header do navegador entrou na PostRequest').toBe(
        slug,
      );
      expect(
        completed?.tenant,
        'o tagging republicou sob o contexto que recebeu: o tenant atravessou os dois processos',
      ).toBe(slug);
      expect(
        completed?.origin,
        'e mesmo carregando o tenant do outro serviço, a autoria continua sendo a sua',
      ).toBe('tagging');
      expect(
        await postRecords.existsInTenant(slug, postId),
        'the post was written in the organization’s own schema',
      ).toBe(true);
    });
  });
