import { expect, test } from '../fixtures/test';
import { WhoAmI } from '../infrastructure/graphql/operations/users.operations';

test.describe('autenticação pelo navegador', () => {
  test('o cookie de sessão é escrito pelo Better Auth do próprio apps/web', async ({
    app,
    accounts,
    authentication,
    environment,
  }) => {
    const origins = app.originsRequesting('/api/auth/');

    await authentication.signIn(accounts.author);

    const session = await authentication.sessionCookie();
    expect(session, 'nenhum cookie de sessão').toBeDefined();
    expect(session?.httpOnly, 'a sessão não pode ser legível por script').toBe(
      true,
    );
    expect(
      origins.filter((origin) => origin !== new URL(environment.webUrl).origin),
      'o login não pode sair para outra origem: o Better Auth que responde é o deste app',
    ).toEqual([]);
  });

  /**
   * O pagamento de `apps/web` ter o SEU Better Auth: o cookie que ele escreveu vale na posts-api,
   * porque a sessão é uma linha que os dois leem e o segredo é o mesmo. É a única asserção da suíte
   * que fala com a API por fora do navegador, e é de propósito — é exatamente o que ela afirma.
   *
   * O documento é o mesmo tipado que o resto da suíte usa: o que muda é o transporte, não a query.
   */
  test('o cookie que o web escreveu é aceito pela posts-api', async ({
    accounts,
    authentication,
    endpoints,
  }) => {
    await authentication.signIn(accounts.author);
    const postsApi = endpoints.postsApi({
      cookie: await authentication.cookieHeader(),
    });

    const answer = await postsApi.execute(WhoAmI);

    expect(answer.errors, JSON.stringify(answer.errors)).toBeUndefined();
    expect(answer.data?.me.email).toBe(accounts.author.email);
    expect(
      answer.data?.me.__typename,
      'o perfil de domínio foi provisionado na primeira leitura',
    ).toBe('Author');
  });

  test('a sessão sobrevive a um reload, porque é uma linha e não um estado de cliente', async ({
    app,
    accounts,
    authentication,
  }) => {
    await authentication.signIn(accounts.author);

    await app.reload();

    await expect(app.header.identity(accounts.author.email)).toBeVisible();
  });

  test('credenciais erradas não autenticam, e a recusa aparece na tela', async ({
    page,
    app,
    accounts,
    authentication,
  }) => {
    await authentication.attemptSignIn({
      email: accounts.author.email,
      password: 'senha-errada-de-proposito',
    });

    await expect(app.signIn.incorrectCredentials).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    await expect(app.header.signInLink).toBeVisible();
  });

  test('quem já entrou é reconhecido ao voltar ao login', async ({
    page,
    app,
    accounts,
    authentication,
  }) => {
    await authentication.signIn(accounts.author);

    await app.visit('/login');

    await expect(page).toHaveURL(/\/auth\/sign-in\?redirectTo=/);
    await expect(app.header.identity(accounts.author.email)).toBeVisible();
  });

  test('sair apaga a sessão, e o cabeçalho volta a oferecer entrar', async ({
    app,
    accounts,
    authentication,
  }) => {
    await authentication.signIn(accounts.author);

    await authentication.signOut();

    await expect(app.header.signInLink).toBeVisible();
    expect(await authentication.liveSessionCookies()).toHaveLength(0);
  });

  test('o papel do autor chega ao cabeçalho: a role está na credencial, não no cliente', async ({
    app,
    accounts,
    authentication,
  }) => {
    await authentication.signIn(accounts.author);

    await expect(app.header.role('author')).toBeVisible();
  });
});
