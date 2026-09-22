import type { ResultOf } from '@graphql-typed-document-node/core';
import { print } from 'graphql';

import { type GraphQlAnswer, expect, test } from '../fixtures/test';
import { graphql } from '../gql';

const MeAtTheApi = graphql(`
  query MeAtTheApi {
    me {
      __typename
      email
    }
  }
`);

test.describe('autenticação pelo navegador', () => {
  test('o cookie de sessão é escrito pelo Better Auth do próprio apps/web', async ({
    page,
    accounts,
    signIn,
  }) => {
    const signUps: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/auth/')) {
        signUps.push(new URL(request.url()).origin);
      }
    });

    await signIn(accounts.author);

    const session = (await page.context().cookies()).find((cookie) =>
      cookie.name.includes('better-auth'),
    );

    expect(session, 'nenhum cookie de sessão').toBeDefined();
    expect(session!.httpOnly, 'a sessão não pode ser legível por script').toBe(true);
    expect(
      signUps,
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
    page,
    accounts,
    signIn,
    apiUrl,
    request,
  }) => {
    await signIn(accounts.author);
    const cookies = (await page.context().cookies())
      .filter((cookie) => cookie.name.includes('better-auth'))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    const response = await request.post(`${apiUrl}/graphql`, {
      headers: { 'content-type': 'application/json', cookie: cookies },
      data: { query: print(MeAtTheApi) },
    });

    const answer = (await response.json()) as GraphQlAnswer<ResultOf<typeof MeAtTheApi>>;
    expect(answer.errors, JSON.stringify(answer.errors)).toBeUndefined();
    expect(answer.data!.me.email).toBe(accounts.author.email);
    expect(answer.data!.me.__typename, 'o perfil de domínio foi provisionado na primeira leitura').toBe(
      'Author',
    );
  });

  test('a sessão sobrevive a um reload, porque é uma linha e não um estado de cliente', async ({
    page,
    accounts,
    signIn,
  }) => {
    await signIn(accounts.author);

    await page.reload();

    await expect(page.getByText(accounts.author.email).first()).toBeVisible();
  });

  test('credenciais erradas não autenticam, e a recusa aparece na tela', async ({
    page,
    accounts,
  }) => {
    await page.goto('/login');
    await page.getByLabel('E-mail').fill(accounts.author.email);
    await page.getByLabel('Senha').fill('senha-errada-de-proposito');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText(/INVALID_EMAIL_OR_PASSWORD|Credenciais inválidas/i)).toBeVisible();
    await expect(page.getByText(accounts.author.email + ' ')).toHaveCount(0);
  });

  test('quem já entrou é reconhecido ao voltar ao login', async ({ page, accounts, signIn }) => {
    await signIn(accounts.author);

    await page.goto('/login');

    await expect(
      page.getByText(`Já autenticado como ${accounts.author.email}`),
    ).toBeVisible();
  });

  test('sair apaga a sessão, e o cabeçalho volta a oferecer entrar', async ({
    page,
    accounts,
    signIn,
  }) => {
    await signIn(accounts.author);

    await page.getByRole('button', { name: 'Sair' }).click();
    await page.waitForURL('**/login');

    await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();
    expect(
      (await page.context().cookies()).filter(
        (cookie) => cookie.name.includes('better-auth') && cookie.value !== '',
      ),
    ).toHaveLength(0);
  });

  test('o papel do autor chega ao cabeçalho: a role está na credencial, não no cliente', async ({
    page,
    accounts,
    signIn,
  }) => {
    await signIn(accounts.author);

    await expect(page.getByText('author', { exact: true })).toBeVisible();
  });
})
