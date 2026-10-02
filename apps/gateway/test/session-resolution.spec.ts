import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Cache } from '@nestjs/cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ContextIdFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { AuthConfig } from '@nestposts/auth/config/auth.config';
import { authConfig } from '@nestposts/auth/config/auth.config';
import { IdentityResolver } from '@nestposts/auth/domain/auth/identity.resolver';
import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { inRequestContext, MikroORM } from '@nestposts/database';
import { migrate } from '@nestposts/migrator/main';
import { RedisConnection } from '@nestposts/redis';
import { ThrowawayRedis } from '@nestposts/redis/testing/throwaway-redis';
import type { YogaInitialContext } from 'graphql-yoga';
import { createSchema, createYoga } from 'graphql-yoga';
import { decodeJwt } from 'jose';

import { appConfig } from '../src/config/app.config';
import { ChatwootAgentBotTokens } from '../src/supergraph/header-resolvers/chatwoot-agent-bot-tokens';
import { OrganizationSlugs } from '../src/supergraph/header-resolvers/organization-slugs';
import { Listening } from './support/listening';

interface OrganizationApi {
  createOrganization(request: {
    body: { name: string; slug: string };
    headers: Headers;
  }): Promise<{ id: string; slug: string } | null>;
}

interface TokenApi {
  oauth2Token(request: {
    body: Record<string, string>;
  }): Promise<{ access_token: string }>;
}

const CHATWOOT_SCHEMA = [
  'create schema if not exists chatwoot',
  `create table if not exists chatwoot.accounts (
     id serial primary key, name text, platform_organization_id text unique, feature_flags bigint,
     status integer not null default 0, created_at timestamptz, updated_at timestamptz)`,
  'create table if not exists chatwoot.agent_bots (id serial primary key, name text, account_id integer)',
  'create table if not exists chatwoot.access_tokens (id serial primary key, owner_type text, owner_id bigint, token text unique)',
];

describe('the gateway resolves who is calling, from Redis first', () => {
  const LINK =
    'extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])';

  let redis: ThrowawayRedis;
  let subgraph: Listening;
  let sdlRoot: string;
  let app: NestFastifyApplication;
  let url: string;
  let received: Record<string, string> = {};
  let chatwoot: Listening;
  let receivedByChatwoot: Record<string, string> = {};

  const auth = () => app.get<BetterAuth>(BETTER_AUTH);
  const inContext = <T>(work: () => Promise<T>) =>
    inRequestContext(app.get(MikroORM), work);

  const signedUp = async (name: string) => {
    const { headers, response } = await inContext(() =>
      auth().api.signUpEmail({
        body: {
          email: `${name}-${Date.now()}@example.com`,
          name,
          password: 'senha-super-secreta',
        },
        returnHeaders: true,
      }),
    );
    const cookie = headers
      .getSetCookie()
      .map((entry: string) => entry.split(';')[0])
      .join('; ');
    return {
      cookie,
      token: response.token as string,
      userId: response.user.id,
    };
  };

  const organizationOf = async (cookie: string, slug: string) => {
    const organization = await inContext(() =>
      (auth().api as unknown as OrganizationApi).createOrganization({
        body: { name: slug, slug },
        headers: new Headers({ cookie }),
      }),
    );
    if (!organization) throw new Error(`${slug} was not created`);
    return organization;
  };

  const callGateway = async (
    headers: Record<string, string>,
    query = '{ whoami }',
  ) => {
    received = {};
    receivedByChatwoot = {};
    const response = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ query }),
    });
    return response.json();
  };

  const execute = (sql: string, params: unknown[] = []) =>
    app
      .get(MikroORM)
      .em.getConnection()
      .execute<Record<string, unknown>[]>(sql, params);

  const agentBotOf = async (
    organizationId: string,
    secret: string,
    scopes: readonly string[] = [ChatwootAgentBotTokens.SCOPE],
  ) => {
    const [account] = await execute(
      'select id from chatwoot.accounts where platform_organization_id = ?',
      [organizationId],
    );
    const [bot] = await execute(
      'insert into chatwoot.agent_bots (name, account_id) values (?, ?) returning id',
      ['Assistente', account.id],
    );
    await execute(
      `insert into chatwoot.access_tokens (owner_type, owner_id, token) values ('AgentBot', ?, ?)`,
      [bot.id, secret],
    );
    const clientId = `${ChatwootAgentBotTokens.CLIENT_ID_PREFIX}${bot.id}`;
    await execute(
      `insert into public.oauth_client (
         id, client_id, client_secret, name, disabled, skip_consent, grant_types, response_types, redirect_uris,
         scopes, client_credentials_scopes, token_endpoint_auth_method, application_type, require_pkce,
         reference_id, metadata, created_at, updated_at
       ) values (
         ?, ?, rtrim(translate(encode(sha256(convert_to(?, 'UTF8')), 'base64'), '+/', '-_'), '='),
         'Assistente', false, true, '["client_credentials"]', '[]', '[]', ?, ?, 'client_secret_post', 'web', false,
         ?, jsonb_build_object('claims', jsonb_build_object('agent_bot_id', ?::bigint)),
         now(), now()
       )`,
      [
        clientId,
        clientId,
        secret,
        JSON.stringify(scopes),
        JSON.stringify(scopes),
        organizationId,
        bot.id,
      ],
    );
    return { clientId, secret };
  };

  const platformTokenOf = async (bot: { clientId: string; secret: string }) => {
    const [gateway] = app.get<AuthConfig>(authConfig.KEY).oauthResources;
    const { access_token } = await inContext(() =>
      (auth().api as unknown as TokenApi).oauth2Token({
        body: {
          grant_type: 'client_credentials',
          client_id: bot.clientId,
          client_secret: bot.secret,
          resource: gateway,
        },
      }),
    );
    return access_token;
  };

  const registerGatewayResource = () =>
    inContext(async () => {
      const [identifier] = app.get<AuthConfig>(authConfig.KEY).oauthResources;
      const { adapter } = await auth().$context;
      const now = new Date();
      await adapter.create({
        model: 'oauthResource',
        data: {
          identifier,
          name: new URL(identifier).host,
          disabled: false,
          dpopBoundAccessTokensRequired: false,
          createdAt: now,
          updatedAt: now,
        },
      });
    });

  beforeAll(async () => {
    redis = await ThrowawayRedis.start();
    process.env.REDIS_URL = redis.url;
    await migrate();

    subgraph = await Listening.on(
      createYoga({
        schema: createSchema({
          typeDefs: 'type Query { whoami: String! }',
          resolvers: {
            Query: {
              whoami: (
                _: unknown,
                __: unknown,
                context: YogaInitialContext,
              ) => {
                received = Object.fromEntries(
                  context.request.headers.entries(),
                );
                return 'posts';
              },
            },
          },
        }),
        logging: false,
      }),
    );
    chatwoot = await Listening.on(
      createYoga({
        schema: createSchema({
          typeDefs: 'type Query { inbox: String! }',
          resolvers: {
            Query: {
              inbox: (_: unknown, __: unknown, context: YogaInitialContext) => {
                receivedByChatwoot = Object.fromEntries(
                  context.request.headers.entries(),
                );
                return 'chatwoot';
              },
            },
          },
        }),
        logging: false,
      }),
    );
    sdlRoot = mkdtempSync(join(tmpdir(), 'gateway-sessions-'));
    mkdirSync(join(sdlRoot, 'posts'));
    writeFileSync(
      join(sdlRoot, 'posts', 'schema.graphql'),
      `${LINK}\ntype Query { whoami: String! }`,
    );
    mkdirSync(join(sdlRoot, 'chatwoot'));
    writeFileSync(
      join(sdlRoot, 'chatwoot', 'schema.graphql'),
      `${LINK}\ntype Query { inbox: String! }`,
    );

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(appConfig.KEY)
      .useValue({
        ...appConfig(),
        logLevel: 'silent',
        subgraphs: [
          { name: 'posts', url: subgraph.url, sdlDir: join(sdlRoot, 'posts') },
          {
            name: 'chatwoot',
            url: chatwoot.url,
            sdlDir: join(sdlRoot, 'chatwoot'),
          },
        ],
      })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { bodyParser: false },
    );
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
    for (const statement of CHATWOOT_SCHEMA) await execute(statement);
    await registerGatewayResource();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await subgraph?.close();
    await chatwoot?.close();
    await redis?.stop();
    delete process.env.REDIS_URL;
    if (sdlRoot) rmSync(sdlRoot, { recursive: true, force: true });
  });

  it('is the authorization server’s discovery endpoint, answering as the issuer', async () => {
    const config = app.get<AuthConfig>(authConfig.KEY);

    const metadata = await (
      await fetch(`${url}/.well-known/oauth-authorization-server`)
    ).json();
    const openId = await (
      await fetch(`${url}/.well-known/openid-configuration`)
    ).json();

    expect(metadata).toMatchObject({
      issuer: config.issuer,
      token_endpoint: `${config.baseUrl}${config.basePath}/oauth2/token`,
      jwks_uri: `${config.baseUrl}${config.basePath}/jwks`,
    });
    expect(openId).toMatchObject({
      issuer: config.issuer,
      jwks_uri: metadata.jwks_uri,
    });
  });

  it('serves Better Auth itself: its keys, and a sign-in that sets the session cookie', async () => {
    const email = `gateway-${Date.now()}@example.com`;
    await inContext(() =>
      auth().api.signUpEmail({
        body: { email, name: 'gateway', password: 'senha-super-secreta' },
      }),
    );
    await execute(
      'update public.users set email_verified = true where email = ?',
      [email],
    );

    const jwks = await (await fetch(`${url}/api/auth/jwks`)).json();
    const signIn = await fetch(`${url}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'senha-super-secreta' }),
    });

    expect(jwks.keys.length).toBeGreaterThan(0);
    expect(signIn.status).toBe(200);
    expect(signIn.headers.getSetCookie().join(';')).toContain('session_token');
  });

  it('reads a cookie session, and routes the caller to the organization it is in', async () => {
    const { cookie, token } = await signedUp('ana');
    const organization = await organizationOf(cookie, `acme-${Date.now()}`);

    await callGateway({ cookie });

    expect(received['x-tenant']).toBe(organization.slug);
    await expect(
      app.get(RedisConnection).client.exists(`better-auth:${token}`),
    ).resolves.toBe(1);
  });

  it('forwards the tenant a caller names over the organization they are in — the root tenant included', async () => {
    const { cookie } = await signedUp('elisa');
    await organizationOf(cookie, `umbrella-${Date.now()}`);

    await callGateway({ cookie, 'x-tenant': 'root' });

    expect(received['x-tenant']).toBe('root');
  });

  it('answers that session from Redis, with its row gone from the database', async () => {
    const { cookie, token } = await signedUp('bruno');
    const organization = await organizationOf(cookie, `initech-${Date.now()}`);
    await inContext(async () =>
      (await auth().$context).adapter.delete({
        model: 'session',
        where: [{ field: 'token', value: token }],
      }),
    );

    await callGateway({ cookie });

    expect(received['x-tenant']).toBe(organization.slug);
  });

  it('keeps the organization’s slug in the Nest cache, on the same Redis', async () => {
    const { cookie } = await signedUp('carla');
    const organization = await organizationOf(cookie, `hooli-${Date.now()}`);

    await callGateway({ cookie });

    await expect(
      app
        .get<Cache>(CACHE_MANAGER)
        .get(OrganizationSlugs.keyOf(organization.id)),
    ).resolves.toBe(organization.slug);
    await expect(
      app
        .get(RedisConnection)
        .client.keys(`*${OrganizationSlugs.keyOf(organization.id)}*`),
    ).resolves.toHaveLength(1);
  });

  it('reads an OAuth access token issued for the gateway as the user it was issued to', async () => {
    const { userId } = await signedUp('diana');
    const [gateway] = app.get<AuthConfig>(authConfig.KEY).oauthResources;
    const { token } = await inContext(() =>
      auth().api.signJWT({
        body: { payload: { sub: userId, aud: gateway, scope: 'openid' } },
      }),
    );

    const contextId = ContextIdFactory.create();
    app.registerRequestByContextId(
      new Request(`${url}/graphql`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      contextId,
    );
    const caller = await app.resolve(IdentityResolver, contextId, {
      strict: false,
    });
    const identity = await inContext(() => caller.identity());

    expect(identity?.kind).toBe('user');
    expect(identity?.principal).toBe(userId);
    expect(identity?.scopes).toEqual(['openid']);
  });

  describe('an agent bot calling Chatwoot with its platform access token', () => {
    it('reaches Chatwoot as the bot’s own access token, and every other subgraph as the token it sent', async () => {
      const { cookie } = await signedUp('fabio');
      const organization = await organizationOf(
        cookie,
        `acme-bot-${Date.now()}`,
      );
      const token = await platformTokenOf(
        await agentBotOf(organization.id, `cw-${Date.now()}-a`),
      );

      const body = await callGateway(
        { authorization: `Bearer ${token}`, 'x-tenant': organization.slug },
        '{ whoami inbox }',
      );

      expect(body).toEqual({ data: { whoami: 'posts', inbox: 'chatwoot' } });
      expect(receivedByChatwoot.api_access_token).toMatch(/^cw-\d+-a$/);
      expect(receivedByChatwoot.authorization).toBeUndefined();
      expect(receivedByChatwoot['x-tenant']).toBe(organization.slug);
      expect(received.authorization).toBe(`Bearer ${token}`);
      expect(received.api_access_token).toBeUndefined();
    });

    it('reads the bot’s platform token as an OAuth client bound to its organization, its claims as attributes', async () => {
      const { cookie } = await signedUp('eva');
      const organization = await organizationOf(
        cookie,
        `umbra-bot-${Date.now()}`,
      );
      const bot = await agentBotOf(organization.id, `cw-${Date.now()}-g`);
      const token = await platformTokenOf(bot);

      const contextId = ContextIdFactory.create();
      app.registerRequestByContextId(
        new Request(`${url}/graphql`, {
          headers: { authorization: `Bearer ${token}` },
        }),
        contextId,
      );
      const caller = await app.resolve(IdentityResolver, contextId, {
        strict: false,
      });
      const identity = await inContext(() => caller.identity());

      expect(identity).toMatchObject({
        kind: 'client',
        clientId: bot.clientId,
        activeOrganizationId: organization.id,
        scopes: [ChatwootAgentBotTokens.SCOPE],
        credential: { type: 'access-token', tokenId: decodeJwt(token).jti },
      });
      expect(identity?.attribute(ChatwootAgentBotTokens.AGENT_BOT_ID)).toBe(
        Number(
          bot.clientId.slice(ChatwootAgentBotTokens.CLIENT_ID_PREFIX.length),
        ),
      );
    });

    it('keeps the bot’s access token in the Nest cache, under the platform token it was exchanged for', async () => {
      const { cookie } = await signedUp('gabi');
      const organization = await organizationOf(
        cookie,
        `globex-bot-${Date.now()}`,
      );
      const secret = `cw-${Date.now()}-b`;
      const token = await platformTokenOf(
        await agentBotOf(organization.id, secret),
      );

      await callGateway({ authorization: `Bearer ${token}` }, '{ inbox }');

      const { jti } = decodeJwt(token);
      await expect(
        app
          .get<Cache>(CACHE_MANAGER)
          .get(ChatwootAgentBotTokens.keyOf(jti as string)),
      ).resolves.toBe(secret);
      expect(receivedByChatwoot.api_access_token).toBe(secret);
    });

    it('exchanges nothing in the tenant of another organization', async () => {
      const { cookie } = await signedUp('helena');
      const own = await organizationOf(cookie, `own-bot-${Date.now()}`);
      const other = await organizationOf(cookie, `other-bot-${Date.now()}`);
      const token = await platformTokenOf(
        await agentBotOf(own.id, `cw-${Date.now()}-c`),
      );

      await callGateway(
        { authorization: `Bearer ${token}`, 'x-tenant': other.slug },
        '{ inbox }',
      );

      expect(receivedByChatwoot.api_access_token).toBeUndefined();
      expect(receivedByChatwoot.authorization).toBe(`Bearer ${token}`);
    });

    it('exchanges nothing for a token not granted the conversations', async () => {
      const { cookie } = await signedUp('igor');
      const organization = await organizationOf(
        cookie,
        `initrode-bot-${Date.now()}`,
      );
      const token = await platformTokenOf(
        await agentBotOf(organization.id, `cw-${Date.now()}-d`, ['read:posts']),
      );

      await callGateway({ authorization: `Bearer ${token}` }, '{ inbox }');

      expect(receivedByChatwoot.api_access_token).toBeUndefined();
    });

    it('exchanges nothing for a JWT the platform signed that is no access token', async () => {
      const { cookie } = await signedUp('joana');
      const organization = await organizationOf(
        cookie,
        `vandelay-bot-${Date.now()}`,
      );
      const bot = await agentBotOf(organization.id, `cw-${Date.now()}-e`);
      const [gateway] = app.get<AuthConfig>(authConfig.KEY).oauthResources;
      const agentBotId = Number(
        bot.clientId.slice(ChatwootAgentBotTokens.CLIENT_ID_PREFIX.length),
      );
      const { token } = await inContext(() =>
        auth().api.signJWT({
          body: {
            payload: {
              sub: bot.clientId,
              aud: gateway,
              client_id: bot.clientId,
              scope: ChatwootAgentBotTokens.SCOPE,
              agent_bot_id: agentBotId,
              organization_id: organization.id,
              jti: `forged-${Date.now()}`,
            },
          },
        }),
      );

      await callGateway({ authorization: `Bearer ${token}` }, '{ inbox }');

      expect(receivedByChatwoot.api_access_token).toBeUndefined();
      expect(receivedByChatwoot.authorization).toBe(`Bearer ${token}`);
    });

    it('exchanges nothing for a platform token whose claims were altered', async () => {
      const { cookie } = await signedUp('karla');
      const organization = await organizationOf(
        cookie,
        `soylent-bot-${Date.now()}`,
      );
      const token = await platformTokenOf(
        await agentBotOf(organization.id, `cw-${Date.now()}-f`),
      );
      const [header, payload, signature] = token.split('.');
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      const altered = [
        header,
        Buffer.from(
          JSON.stringify({
            ...claims,
            exp: claims.exp + 86_400,
            jti: `altered-${claims.jti}`,
          }),
        ).toString('base64url'),
        signature,
      ].join('.');

      await callGateway({ authorization: `Bearer ${altered}` }, '{ inbox }');

      expect(receivedByChatwoot.api_access_token).toBeUndefined();
    });

    it('hands a user’s access token to Chatwoot as it came', async () => {
      const { userId } = await signedUp('lia');
      const [gateway] = app.get<AuthConfig>(authConfig.KEY).oauthResources;
      const { token } = await inContext(() =>
        auth().api.signJWT({
          body: { payload: { sub: userId, aud: gateway, scope: 'openid' } },
        }),
      );

      await callGateway({ authorization: `Bearer ${token}` }, '{ inbox }');

      expect(receivedByChatwoot.authorization).toBe(`Bearer ${token}`);
      expect(receivedByChatwoot.api_access_token).toBeUndefined();
    });
  });

  it('forwards a caller with no credentials as nobody', async () => {
    await callGateway({});

    expect(received['x-tenant']).toBeUndefined();
    expect(received.cookie).toBeUndefined();
  });
});
