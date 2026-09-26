import { expect, test } from '../fixtures/test';
import { PostById } from '../infrastructure/graphql/operations/posts.operations';

/**
 * O caminho de leitura, que é anônimo de propósito: um post escrito por um autor tem de aparecer para
 * quem nunca entrou. O que isto exercita de verdade são os `@ResolveField` — `author` e `tags` custam
 * uma resolução cada, e é na tela que se vê se ela aconteceu.
 */
test.describe
  .serial('o feed, lido de fora', () => {
    let title: string;

    test('um post escrito pelo autor aparece no feed', async ({
      app,
      accounts,
      authentication,
      publishing,
    }) => {
      title = `Lido de fora ${Date.now()}`;

      await authentication.signIn(accounts.author);
      await publishing.publishInTheForm({ title, content: 'o corpo' });

      await app.feed.open();

      await expect(app.feed.mentions(title)).toBeVisible();
    });

    test('e aparece para quem nunca entrou, com o autor e a tag resolvidos', async ({
      accounts,
      visitors,
    }) => {
      const stranger = await visitors.arrive();

      await stranger.app.feed.open();

      await expect(stranger.app.feed.mentions(title)).toBeVisible();
      await expect(
        stranger.app.feed.mentions(accounts.author.email),
        'o byline é o @ResolveField author, resolvido sem sessão',
      ).toBeVisible();
      await expect(stranger.app.feed.mentions('Untagged')).toBeVisible();
      await expect(stranger.app.header.signInLink).toBeVisible();
    });

    /**
     * `post(id: ID!): Post` é anulável no schema, e um id desconhecido responde `null` SEM erro — é a
     * diferença entre "não achei" e "quebrou", e quem consulta um id que pode não existir recebe a
     * primeira. Uma seleção inválida, por outro lado, é erro antes de existir query.
     */
    test('um id que não existe responde null, e não um erro', async ({
      graphql,
    }) => {
      const missing = await graphql.execute(PostById, {
        id: '00000000-0000-4000-8000-000000000000',
      });

      expect(missing.errors, JSON.stringify(missing.errors)).toBeUndefined();
      expect(missing.data?.post).toBeNull();
    });

    test('e um id que não é um id é recusado pelo schema', async ({
      graphql,
    }) => {
      const invalid = await graphql.execute(PostById, {
        id: 'isto-nao-e-um-uuid',
      });

      expect(JSON.stringify(invalid.errors)).toMatch(
        /BAD_USER_INPUT|inválido|invalid/i,
      );
    });
  });
