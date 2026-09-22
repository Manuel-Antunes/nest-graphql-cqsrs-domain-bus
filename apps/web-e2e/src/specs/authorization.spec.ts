import { expect, test } from '../fixtures/test';

/**
 * Os três estados de `/posts/new`, que é onde a autorização deste sistema é visível: quem não entrou,
 * quem entrou sem o papel `author`, e quem o tem. A recusa do meio é a que importa — ela é a mesma
 * regra que `@Roles([AUTHOR_ROLE])` aplica na mutation, vista de fora.
 */
test.describe('autorização', () => {
  test('anônimo não escreve, e a página diz por onde entrar', async ({ page }) => {
    await page.goto('/posts/new');

    await expect(page.getByText('Entre para escrever')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ir para o login' })).toBeVisible();
    await expect(page.getByLabel('Título')).toHaveCount(0);
  });

  test('autenticado sem o papel author não escreve', async ({ page, accounts, signIn }) => {
    await signIn(accounts.reader);

    await page.goto('/posts/new');

    await expect(page.getByText('Esta conta não tem a role author')).toBeVisible();
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
    graphql,
  }) => {
    await signIn(accounts.reader);

    const refused = await graphql<{ createPost: { id: string } | null }>(
      'mutation { createPost(input: { title: "Do leitor", content: "c" }) { id } }',
    );

    expect(refused.data?.createPost ?? null).toBeNull();
    expect(JSON.stringify(refused.errors)).toMatch(/FORBIDDEN|UNAUTHENTICATED|not an author|autor/i);
  });

  test('e a leitura é anônima de propósito: o feed responde sem sessão', async ({ graphql }) => {
    const posts = await graphql<{ posts: { totalCount: number } }>(
      '{ posts(first: 1) { totalCount } }',
    );

    expect(posts.errors, JSON.stringify(posts.errors)).toBeUndefined();
    expect(typeof posts.data!.posts.totalCount).toBe('number');
  });

  test('me é polimórfico: o autor casa com ... on Author, o leitor não', async ({
    page,
    accounts,
    signIn,
    graphql,
  }) => {
    const typeOfMe = async () =>
      (await graphql<{ me: { __typename: string } }>('{ me { __typename } }')).data!.me.__typename;

    await signIn(accounts.reader);
    expect(await typeOfMe()).toBe('User');

    await page.getByRole('button', { name: 'Sair' }).click();
    await page.waitForURL('**/login');

    await signIn(accounts.author);
    expect(await typeOfMe()).toBe('Author');
  });
});
