import { expect, test } from '../fixtures/test';
import { OAuthProvider } from '../infrastructure/auth/oauth-provider';
import { Pkce } from '../infrastructure/auth/pkce';
import { FederatedMe } from '../infrastructure/graphql/operations/users.operations';

const SCOPE = 'openid profile email read:posts';

/**
 * **This system is an OAuth 2.1 provider, and its consent screen is better-auth-ui's.**
 *
 * An administrator registers a public client — a CLI on the loopback, the case RFC 8252 describes —
 * and a user authorizes it: Better Auth sends the browser to the consent screen with a signed query,
 * the user allows, and the browser lands on the client's redirect with a code. The code, exchanged
 * with the PKCE verifier, is an access token that answers for that user at `userinfo`.
 *
 * Asked for the gateway as its resource (RFC 8707), the token is a JWT addressed to it — and it is a
 * session everywhere past the gateway: the gateway forwards the bearer, and each subgraph verifies it
 * locally against the keys in the shared database.
 */
test.describe('the OAuth provider', () => {
  test('a user authorizes an application on the consent screen, and its token answers for them', async ({
    accounts,
    authentication,
    oauth,
    oauthProvider,
    endpoints,
    environment,
    visitors,
  }) => {
    const callback = oauthProvider.loopbackCallback;
    const admin = await visitors.arrive();
    await admin.authentication.signIn(accounts.admin);
    const clientId = await admin.oauth.registerClient({
      name: 'Posts CLI',
      redirectUri: callback,
      scope: SCOPE,
    });
    await admin.leave();

    await authentication.signIn(accounts.reader);
    const pkce = Pkce.generate();
    const consent = await oauth.requestConsent({
      clientId,
      redirectUri: callback,
      scope: SCOPE,
      state: 'e2e-state',
      resource: environment.gatewayUrl,
      pkce,
    });

    await expect(consent.requestBy('Posts CLI')).toBeVisible();
    await expect(consent.scope('Read your posts')).toBeVisible();
    const returned = await oauth.allow(callback);

    expect(returned.searchParams.get('state')).toBe('e2e-state');
    const tokens = await oauthProvider.exchange({
      code: returned.searchParams.get('code') as string,
      clientId,
      redirectUri: callback,
      resource: environment.gatewayUrl,
      pkce,
    });
    expect(tokens.status).toBe(200);
    expect(await oauthProvider.userinfo(tokens.accessToken)).toMatchObject({
      email: accounts.reader.email,
    });
    expect(OAuthProvider.audienceOf(tokens.accessToken)).toContain(
      environment.gatewayUrl,
    );

    const federated = await endpoints
      .gateway({ authorization: `Bearer ${tokens.accessToken}` })
      .execute(FederatedMe);
    expect(federated.errors, JSON.stringify(federated.errors)).toBeUndefined();
    expect(federated.data).toMatchObject({
      me: { email: accounts.reader.email, unreadNotificationCount: 0 },
      unreadNotificationCount: 0,
    });
  });
});
