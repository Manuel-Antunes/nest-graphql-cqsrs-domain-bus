import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import type { Listening } from '../testing/listening';
import { listening } from '../testing/listening';
import { JwksGatewayTokenVerifier } from './jwks-gateway-token-verifier';

const ISSUER = 'http://localhost:4200';
const AUDIENCE = 'http://localhost:4000';

describe('JwksGatewayTokenVerifier', () => {
  let keys: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: Listening;
  let verifier: JwksGatewayTokenVerifier;

  const token = (
    claims: Record<string, unknown>,
    overrides: { audience?: string; issuer?: string } = {},
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: 'k-1' })
      .setIssuer(overrides.issuer ?? ISSUER)
      .setAudience(overrides.audience ?? AUDIENCE)
      .setSubject('user-1')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(keys.privateKey);

  beforeAll(async () => {
    keys = await generateKeyPair('ES256');
    const publicJwk = {
      ...(await exportJWK(keys.publicKey)),
      kid: 'k-1',
      alg: 'ES256',
    };
    jwks = await listening((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ keys: [publicJwk] }));
    });
    verifier = new JwksGatewayTokenVerifier({
      jwksUrl: jwks.url,
      issuer: ISSUER,
      audience: AUDIENCE,
    });
  });

  afterAll(() => jwks?.close());

  it('reads the identity out of a token issued for this gateway', async () => {
    const identity = await verifier.verify(
      `Bearer ${await token({ azp: 'client-7', scope: 'openid read:posts', organization_slug: 'acme' })}`,
    );

    expect(identity).toEqual({
      subject: 'user-1',
      clientId: 'client-7',
      scopes: ['openid', 'read:posts'],
      organizationId: undefined,
      organizationSlug: 'acme',
    });
  });

  it('refuses a token issued for another resource, or by another issuer', async () => {
    await expect(
      verifier.verify(
        `Bearer ${await token({}, { audience: 'http://elsewhere' })}`,
      ),
    ).resolves.toBeNull();
    await expect(
      verifier.verify(
        `Bearer ${await token({}, { issuer: 'http://impostor' })}`,
      ),
    ).resolves.toBeNull();
  });

  it('answers nothing for what is not a signed bearer token', async () => {
    await expect(verifier.verify(undefined)).resolves.toBeNull();
    await expect(
      verifier.verify('Bearer opaque-session-token'),
    ).resolves.toBeNull();
    await expect(verifier.verify('Basic dXNlcjpwYXNz')).resolves.toBeNull();
    await expect(verifier.verify('Bearer a.b.c')).resolves.toBeNull();
  });
});
