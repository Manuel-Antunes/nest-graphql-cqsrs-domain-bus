import { createHash, randomBytes } from 'node:crypto';

import { expect, signInThroughTheForm, test } from '../fixtures/test';
import { WEB_URL } from '../support/stack';

const CALLBACK = new URL(
  '/oauth-callback',
  WEB_URL.replace('localhost', '127.0.0.1'),
).href;

/**
 * **This system is an OAuth 2.1 provider, and its consent screen is better-auth-ui's.**
 *
 * An administrator registers a public client — a CLI on the loopback, the case RFC 8252 describes —
 * and a user authorizes it: Better Auth sends the browser to the consent screen with a signed query,
 * the user allows, and the browser lands on the client's redirect with a code. The code, exchanged
 * with the PKCE verifier, is an access token that answers for that user at `userinfo`.
 */
test.describe('the OAuth provider', () => {
  test('a user authorizes an application on the consent screen, and its token answers for them', async ({
    browser,
    page,
    accounts,
    signIn,
  }) => {
    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await signInThroughTheForm(adminPage, accounts.admin);
    await expect(
      adminPage.getByText(accounts.admin.email).first(),
    ).toBeVisible();
    const registered = await adminPage.request.post(
      '/api/auth/oauth2/create-client',
      {
        headers: { origin: WEB_URL },
        data: {
          client_name: 'Posts CLI',
          redirect_uris: [CALLBACK],
          application_type: 'native',
          token_endpoint_auth_method: 'none',
          scope: 'openid profile email read:posts',
        },
      },
    );
    expect(registered.status(), await registered.text()).toBe(201);
    const { client_id: clientId } = (await registered.json()) as {
      client_id: string;
    };
    await admin.close();

    await signIn(accounts.reader);
    const verifier = randomBytes(32).toString('base64url');
    const authorize = new URL('/api/auth/oauth2/authorize', WEB_URL);
    authorize.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: CALLBACK,
      scope: 'openid profile email read:posts',
      state: 'e2e-state',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }).toString();
    await page.goto(authorize.href);

    await expect(page).toHaveURL(/\/auth\/oauth-consent/);
    await expect(page.getByText('Authorize Posts CLI')).toBeVisible();
    await expect(page.getByText('Read your posts')).toBeVisible();
    await page.getByRole('button', { name: 'Allow' }).click();

    await page.waitForURL((url) => url.href.startsWith(CALLBACK));
    const returned = new URL(page.url());
    expect(returned.searchParams.get('state')).toBe('e2e-state');
    const code = returned.searchParams.get('code') as string;

    const tokens = await fetch(`${WEB_URL}/api/auth/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: CALLBACK,
        client_id: clientId,
        code_verifier: verifier,
      }),
    });
    expect(tokens.status).toBe(200);
    const { access_token: accessToken } = (await tokens.json()) as {
      access_token: string;
    };

    const userinfo = await fetch(`${WEB_URL}/api/auth/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(await userinfo.json()).toMatchObject({
      email: accounts.reader.email,
    });
  });
});
