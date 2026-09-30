import type { JWK } from 'jose';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import type { BetterAuth } from '../init-auth';
import { AccessTokens } from './access-tokens';

const ISSUER = 'http://localhost:4200';
const GATEWAY = 'http://localhost:4000/graphql';

describe('AccessTokens', () => {
  let signingKey: CryptoKey;
  let strangerKey: CryptoKey;
  let publicKey: JWK;
  let tokens: AccessTokens;

  const signed = (
    claims: Record<string, unknown>,
    {
      key = signingKey,
      typ = AccessTokens.ACCESS_TOKEN_TYPE,
      expiresIn = '1h',
    }: { key?: CryptoKey; typ?: string; expiresIn?: string } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: 'k1', typ })
      .setIssuer(ISSUER)
      .setAudience(GATEWAY)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(key);

  const clientToken = (overrides: Record<string, unknown> = {}) =>
    signed({
      sub: 'chatwoot-agent-bot-7',
      client_id: 'chatwoot-agent-bot-7',
      scope: 'write:conversations',
      jti: 'jti-7',
      agent_bot_id: 7,
      organization_id: 'org-acme',
      ...overrides,
    });

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256', { extractable: true });
    signingKey = pair.privateKey;
    strangerKey = (await generateKeyPair('ES256')).privateKey;
    publicKey = {
      ...(await exportJWK(pair.publicKey)),
      kid: 'k1',
      alg: 'ES256',
    };
    const auth = {
      api: { getJwks: async () => ({ keys: [publicKey] }) },
    } as unknown as BetterAuth;
    tokens = new AccessTokens(auth, {
      issuer: ISSUER,
      oauthResources: [GATEWAY],
    });
  });

  it('reads a client’s own token as that client, bound to its organization, its claims as attributes', async () => {
    const identity = await tokens.clientIdentityOf(await clientToken());

    expect(identity).toMatchObject({
      kind: 'client',
      clientId: 'chatwoot-agent-bot-7',
      scopes: ['write:conversations'],
      activeOrganizationId: 'org-acme',
      attributes: { agent_bot_id: 7, organization_id: 'org-acme' },
      credential: { type: 'access-token', tokenId: 'jti-7' },
    });
    expect(identity?.credential).toHaveProperty('expiresAt', expect.any(Date));
  });

  it('binds a client registered for no organization to none', async () => {
    const identity = await tokens.clientIdentityOf(
      await clientToken({ organization_id: undefined }),
    );

    expect(identity?.activeOrganizationId).toBeNull();
  });

  it.each([
    [
      'signed with another key',
      () =>
        signed({ sub: 'c', client_id: 'c', jti: 'j' }, { key: strangerKey }),
    ],
    [
      'that is no access token',
      () => signed({ sub: 'c', client_id: 'c', jti: 'j' }, { typ: 'JWT' }),
    ],
    [
      'that has expired',
      () =>
        signed({ sub: 'c', client_id: 'c', jti: 'j' }, { expiresIn: '-1m' }),
    ],
    [
      'issued on a user’s behalf',
      () => signed({ sub: 'ana', client_id: 'c', jti: 'j' }),
    ],
    ['with no token id', () => signed({ sub: 'c', client_id: 'c' })],
  ])('refuses a token %s', async (_case, token) => {
    await expect(tokens.clientIdentityOf(await token())).resolves.toBeNull();
  });

  it('refuses a token for another resource or from another issuer', async () => {
    const elsewhere = await new SignJWT({ sub: 'c', client_id: 'c', jti: 'j' })
      .setProtectedHeader({ alg: 'ES256', kid: 'k1', typ: 'at+jwt' })
      .setIssuer('http://impostor')
      .setAudience('http://elsewhere')
      .setExpirationTime('1h')
      .sign(signingKey);

    await expect(tokens.clientIdentityOf(elsewhere)).resolves.toBeNull();
  });

  it('tells a client’s own token from one issued on a user’s behalf without verifying it', async () => {
    expect(AccessTokens.isIssuedToAClient(await clientToken())).toBe(true);
    expect(
      AccessTokens.isIssuedToAClient(
        await signed({ sub: 'ana', client_id: 'chatwoot-agent-bot-7' }),
      ),
    ).toBe(false);
    expect(AccessTokens.isIssuedToAClient('not-a-token')).toBe(false);
  });

  it('keeps only the claims an issuer added as attributes', () => {
    expect(
      AccessTokens.attributesOf({
        iss: ISSUER,
        sub: 'c',
        aud: GATEWAY,
        exp: 1,
        jti: 'j',
        scope: 'openid',
        client_id: 'c',
        azp: 'c',
        agent_bot_id: 7,
      }),
    ).toEqual({ agent_bot_id: 7 });
  });

  it('reads a bearer’s token only when it is a signed JWT', () => {
    expect(AccessTokens.bearerOf('Bearer a.b.c')).toBe('a.b.c');
    expect(AccessTokens.bearerOf('Bearer opaque')).toBeUndefined();
    expect(AccessTokens.bearerOf('Basic dXNlcjpwYXNz')).toBeUndefined();
    expect(AccessTokens.bearerOf(null)).toBeUndefined();
  });
});
