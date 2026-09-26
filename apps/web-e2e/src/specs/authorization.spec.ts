import { expect, test } from '../fixtures/test';
import {
  CreatePost,
  FeedTotalCount,
} from '../infrastructure/graphql/operations/posts.operations';
import { WhoAmI } from '../infrastructure/graphql/operations/users.operations';

/**
 * Os três estados de `/posts/new`, que é onde a autorização deste sistema é visível: quem não entrou,
 * quem entrou sem o papel `author`, e quem o tem. A recusa do meio é a que importa — ela é a mesma
 * regra que `@Roles([AUTHOR_ROLE])` aplica na mutation, vista de fora.
 */
test.describe('autorização', () => {
  test('anônimo não escreve, e a página diz por onde entrar', async ({
    app,
  }) => {
    await app.newPost.open();

    await expect(app.newPost.signInPrompt).toBeVisible();
    await expect(app.newPost.loginLink).toBeVisible();
    await expect(app.newPost.titleField).toHaveCount(0);
  });

  test('autenticado sem o papel author não escreve', async ({
    app,
    accounts,
    authentication,
  }) => {
    await authentication.signIn(accounts.reader);

    await app.newPost.open();

    await expect(app.newPost.notAnAuthor).toBeVisible();
    await expect(app.newPost.titleField).toHaveCount(0);
  });

  test('o autor escreve', async ({ app, accounts, authentication }) => {
    await authentication.signIn(accounts.author);

    await app.newPost.open();

    await expect(app.newPost.titleField).toBeVisible();
    await expect(app.newPost.publishButton).toBeEnabled();
  });

  test('a recusa vem do servidor, não da tela: o leitor é barrado na mutation', async ({
    accounts,
    authentication,
    graphql,
  }) => {
    await authentication.signIn(accounts.reader);

    const refused = await graphql.execute(CreatePost, {
      input: { title: 'Do leitor', content: 'c' },
    });

    expect(refused.data?.createPost ?? null).toBeNull();
    expect(JSON.stringify(refused.errors)).toMatch(
      /FORBIDDEN|UNAUTHENTICATED|not an author|autor/i,
    );
  });

  test('e a leitura é anônima de propósito: o feed responde sem sessão', async ({
    graphql,
  }) => {
    const posts = await graphql.execute(FeedTotalCount);

    expect(posts.errors, JSON.stringify(posts.errors)).toBeUndefined();
    expect(typeof posts.data?.posts.totalCount).toBe('number');
  });

  test('me é polimórfico: o autor casa com ... on Author, o leitor não', async ({
    accounts,
    authentication,
    graphql,
  }) => {
    const typeOfMe = async () =>
      (await graphql.execute(WhoAmI)).data?.me.__typename;

    await authentication.signIn(accounts.reader);
    expect(await typeOfMe()).toBe('User');

    await authentication.signOut();

    await authentication.signIn(accounts.author);
    expect(await typeOfMe()).toBe('Author');
  });
});
