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

import { appConfig } from '../src/config/app.config';
import { OrganizationSlugs } from '../src/graphql/organization-slugs';
import { Listening } from './support/listening';

interface OrganizationApi {
  createOrganization(request: {
    body: { name: string; slug: string };
    headers: Headers;
  }): Promise<{ id: string; slug: string } | null>;
}

describe('the gateway resolves who is calling, from Redis first', () => {
  const LINK =
    'extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])';

  let redis: ThrowawayRedis;
  let subgraph: Listening;
  let sdlRoot: string;
  let app: NestFastifyApplication;
  let url: string;
  let received: Record<string, string> = {};

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

  const callGateway = async (headers: Record<string, string>) => {
    received = {};
    const response = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ query: '{ whoami }' }),
    });
    return response.json();
  };

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
    sdlRoot = mkdtempSync(join(tmpdir(), 'gateway-sessions-'));
    mkdirSync(join(sdlRoot, 'posts'));
    writeFileSync(
      join(sdlRoot, 'posts', 'schema.graphql'),
      `${LINK}\ntype Query { whoami: String! }`,
    );

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(appConfig.KEY)
      .useValue({
        ...appConfig(),
        logLevel: 'silent',
        subgraphs: [
          { name: 'posts', url: subgraph.url, sdlDir: join(sdlRoot, 'posts') },
        ],
      })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await subgraph?.close();
    await redis?.stop();
    delete process.env.REDIS_URL;
    if (sdlRoot) rmSync(sdlRoot, { recursive: true, force: true });
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

    expect(identity?.userId.value).toBe(userId);
    expect(identity?.scopes).toEqual(['openid']);
  });

  it('forwards a caller with no credentials as nobody', async () => {
    await callGateway({});

    expect(received['x-tenant']).toBeUndefined();
    expect(received.cookie).toBeUndefined();
  });
});
