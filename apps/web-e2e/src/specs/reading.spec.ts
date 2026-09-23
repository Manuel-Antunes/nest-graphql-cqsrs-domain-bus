import { expect, test } from '../fixtures/test';
import { graphql } from '../gql';

const MissingPost = graphql(`
  query MissingPost($id: ID!) {
    post(id: $id) {
      id
    }
  }
`);

const PostByInvalidId = graphql(`
  query PostByInvalidId {
    post(id: "isto-nao-e-um-uuid") {
      id
    }
  }
`);

/**
 * O caminho de leitura, que é anônimo de propósito: um post escrito por um autor tem de aparecer para
 * quem nunca entrou. O que isto exercita de verdade são os `@ResolveField` — `author` e `tags` custam
 * uma resolução cada, e é na tela que se vê se ela aconteceu.
 */
test.describe.serial('o feed, lido de fora', () => {
  let title: string;

  test('um post escrito pelo autor aparece no feed', async ({
    page,
    accounts,
    signIn,
  }) => {
    title = `Lido de fora ${Date.now()}`;

    await signIn(accounts.author);
    await page.goto('/posts/new');
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Conteúdo').fill('o corpo');
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText(/Resposta da mutation/)).toBeVisible();

    await page.goto('/feed');

    await expect(page.getByText(title).first()).toBeVisible();
  });

  test('e aparece para quem nunca entrou, com o autor e a tag resolvidos', async ({
    browser,
    accounts,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('/feed');

    await expect(page.getByText(title).first()).toBeVisible();
    await expect(
      page.getByText(accounts.author.email).first(),
      'o byline é o @ResolveField author, resolvido sem sessão',
    ).toBeVisible();
    await expect(page.getByText('Untagged').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();

    await context.close();
  });

  /**
   * `post(id: ID!): Post` é anulável no schema, e um id desconhecido responde `null` SEM erro — é a
   * diferença entre "não achei" e "quebrou", e quem consulta um id que pode não existir recebe a
   * primeira. Uma seleção inválida, por outro lado, é erro antes de existir query.
   */
  test('um id que não existe responde null, e não um erro', async ({
    executeGraphql,
  }) => {
    const missing = await executeGraphql(MissingPost, {
      id: '00000000-0000-4000-8000-000000000000',
    });

    expect(missing.errors, JSON.stringify(missing.errors)).toBeUndefined();
    expect(missing.data!.post).toBeNull();
  });

  test('e um id que não é um id é recusado pelo schema', async ({
    executeGraphql,
  }) => {
    const invalid = await executeGraphql(PostByInvalidId);

    expect(JSON.stringify(invalid.errors)).toMatch(
      /BAD_USER_INPUT|inválido|invalid/i,
    );
  });
});
