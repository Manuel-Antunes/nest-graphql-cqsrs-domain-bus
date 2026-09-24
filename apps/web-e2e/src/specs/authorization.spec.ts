import { expect, test } from '../fixtures/test';
import { graphql } from '../gql';

const ReaderCreatePost = graphql(`
  mutation ReaderCreatePost {
    createPost(input: { title: "Do leitor", content: "c" }) {
      id
    }
  }
`);

const FeedTotalCount = graphql(`
  query FeedTotalCount {
    posts(first: 1) {
      totalCount
    }
  }
`);

const WhoAmI = graphql(`
  query WhoAmI {
    me {
      __typename
    }
  }
`);

/**
 * Os três estados de `/posts/new`, que é onde a autorização deste sistema é visível: quem não entrou,
 * quem entrou sem o papel `author`, e quem o tem. A recusa do meio é a que importa — ela é a mesma
 * regra que `@Roles([AUTHOR_ROLE])` aplica na mutation, vista de fora.
 */
test.describe('autorização', () => {
  test('anônimo não escreve, e a página diz por onde entrar', async ({
    page,
  }) => {
    await page.goto('/posts/new');

    await expect(page.getByText('Entre para escrever')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Ir para o login' }),
    ).toBeVisible();
    await expect(page.getByLabel('Título')).toHaveCount(0);
  });

  test('autenticado sem o papel author não escreve', async ({
    page,
    accounts,
    signIn,
  }) => {
    await signIn(accounts.reader);

    await page.goto('/posts/new');

    await expect(
      page.getByText('Esta conta não tem a role author'),
    ).toBeVisible();
    await expect(page.getByLabel('Título')).toHaveCount(0);
  });

  test('o autor escreve', async ({ page, accounts, signIn }) => {
    await signIn(accounts.author);

    await page.goto('/posts/new');

    await expect(page.getByLabel('Título')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publicar' })).toBeEnabled();
  });

  test('a recusa vem do servidor, não da tela: o leitor é barrado na mutation', async ({
    accounts,
    signIn,
    executeGraphql,
  }) => {
    await signIn(accounts.reader);

    const refused = await executeGraphql(ReaderCreatePost);

    expect(refused.data?.createPost ?? null).toBeNull();
    expect(JSON.stringify(refused.errors)).toMatch(
      /FORBIDDEN|UNAUTHENTICATED|not an author|autor/i,
    );
  });

  test('e a leitura é anônima de propósito: o feed responde sem sessão', async ({
    executeGraphql,
  }) => {
    const posts = await executeGraphql(FeedTotalCount);

    expect(posts.errors, JSON.stringify(posts.errors)).toBeUndefined();
    expect(typeof posts.data?.posts.totalCount).toBe('number');
  });

  test('me é polimórfico: o autor casa com ... on Author, o leitor não', async ({
    page,
    accounts,
    signIn,
    executeGraphql,
  }) => {
    const typeOfMe = async () =>
      (await executeGraphql(WhoAmI)).data?.me.__typename;

    await signIn(accounts.reader);
    expect(await typeOfMe()).toBe('User');

    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Sign Out' }).click();
    await page.waitForURL('**/auth/sign-in**');

    await signIn(accounts.author);
    expect(await typeOfMe()).toBe('Author');
  });
});
