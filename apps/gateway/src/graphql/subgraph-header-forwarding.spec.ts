import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { IdentityResolver } from '@nestposts/auth/domain/auth/identity.resolver';
import { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import type { YogaInitialContext } from 'graphql-yoga';
import { createSchema, createYoga } from 'graphql-yoga';

import { Listening } from '../../test/support/listening';
import { AppModule } from '../app.module';
import { appConfig } from '../config/app.config';
import { OrganizationSlugs } from './organization-slugs';

const LINK =
  'extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key"])';

class StubIdentityResolver extends IdentityResolver {
  caller: Identity | null = null;
  calls = 0;

  async identity(): Promise<Identity | null> {
    this.calls += 1;
    return this.caller;
  }
}

describe('what the gateway forwards to each subgraph', () => {
  const identities = new StubIdentityResolver();
  const received = new Map<string, Record<string, string>>();
  const subgraphs: Listening[] = [];
  let sdlRoot: string;
  let app: NestFastifyApplication;
  let url: string;

  const subgraph = async (name: string, field: string) => {
    const served = await Listening.on(
      createYoga({
        schema: createSchema({
          typeDefs: `type Query { ${field}: String! }`,
          resolvers: {
            Query: {
              [field]: (
                _: unknown,
                __: unknown,
                context: YogaInitialContext,
              ) => {
                received.set(
                  name,
                  Object.fromEntries(context.request.headers.entries()),
                );
                return name;
              },
            },
          },
        }),
        logging: false,
      }),
    );
    subgraphs.push(served);
    const sdlDir = join(sdlRoot, name);
    mkdirSync(sdlDir);
    writeFileSync(
      join(sdlDir, 'schema.graphql'),
      `${LINK}\ntype Query { ${field}: String! }`,
    );
    return { name, url: served.url, sdlDir };
  };

  const callGateway = async (
    headers: Record<string, string>,
    identity: Identity | null = null,
    query = '{ whoami }',
  ) => {
    received.clear();
    identities.caller = identity;
    const response = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ query }),
    });
    return response.json();
  };

  const boundTo = (organizationId?: string) =>
    Identity.parse({
      userId: 'ana',
      email: 'ana@example.com',
      name: 'Ana',
      roles: ['user'],
      activeOrganizationId: organizationId,
    });

  beforeAll(async () => {
    sdlRoot = mkdtempSync(join(tmpdir(), 'gateway-subgraphs-'));
    const sources = [
      await subgraph('main-graph', 'whoami'),
      await subgraph('other', 'echo'),
    ];

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(appConfig.KEY)
      .useValue({ ...appConfig(), logLevel: 'silent', subgraphs: sources })
      .overrideProvider(IdentityResolver)
      .useValue(identities)
      .overrideProvider(OrganizationSlugs)
      .useValue({
        of: async (organizationId?: string) =>
          organizationId === 'org-mota' ? 'mota' : undefined,
      })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all(subgraphs.map((served) => served.close()));
    rmSync(sdlRoot, { recursive: true, force: true });
  });

  it('forwards the caller’s cookie', async () => {
    const body = await callGateway({ cookie: 'session=abc' });

    expect(body).toEqual({ data: { whoami: 'main-graph' } });
    expect(received.get('main-graph')?.cookie).toBe('session=abc');
  });

  it('forwards the bearer and the tenant', async () => {
    await callGateway({ authorization: 'Bearer t-1', 'x-tenant': 'acme' });

    expect(received.get('main-graph')).toMatchObject({
      authorization: 'Bearer t-1',
      'x-tenant': 'acme',
    });
  });

  it('routes a caller by the organization their session is in when no header names one', async () => {
    await callGateway({ cookie: 'session=abc' }, boundTo('org-mota'));

    expect(received.get('main-graph')?.['x-tenant']).toBe('mota');
  });

  it('lets an explicit x-tenant win over the session', async () => {
    await callGateway(
      { cookie: 'session=abc', 'x-tenant': 'acme' },
      boundTo('org-mota'),
    );

    expect(received.get('main-graph')?.['x-tenant']).toBe('acme');
  });

  it('sends no tenant for a session in no organization', async () => {
    await callGateway({ cookie: 'session=abc' }, boundTo());

    expect(received.get('main-graph')?.['x-tenant']).toBeUndefined();
  });

  it('resolves the caller once per request, however many subgraphs it reaches', async () => {
    identities.calls = 0;

    const body = await callGateway(
      { authorization: 'Bearer once', cookie: 'session=abc' },
      null,
      '{ whoami echo }',
    );

    expect(body).toEqual({ data: { whoami: 'main-graph', echo: 'other' } });
    expect(identities.calls).toBe(1);
    for (const name of ['main-graph', 'other']) {
      expect(received.get(name)).toMatchObject({
        authorization: 'Bearer once',
        cookie: 'session=abc',
      });
    }
  });

  it('serves the composed API schema for tooling', async () => {
    const response = await fetch(`${url}/graphql/schema.graphql`);

    await expect(response.text()).resolves.toContain('whoami: String!');
  });
});
