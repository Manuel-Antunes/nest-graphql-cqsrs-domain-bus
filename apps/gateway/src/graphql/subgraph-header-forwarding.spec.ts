import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { IdentityResolver } from '@nestposts/auth/domain/auth/identity.resolver';
import { ClientIdentity } from '@nestposts/auth/domain/auth/vo/client-identity';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import { UserIdentity } from '@nestposts/auth/domain/auth/vo/user-identity';
import type { YogaInitialContext } from 'graphql-yoga';
import { createSchema, createYoga } from 'graphql-yoga';

import { Listening } from '../../test/support/listening';
import { AppModule } from '../app.module';
import { appConfig } from '../config/app.config';
import { ChatwootAgentBotTokens } from '../supergraph/header-resolvers/chatwoot-agent-bot-tokens';
import { OrganizationSlugs } from '../supergraph/header-resolvers/organization-slugs';

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

  const exchanged: (Identity | null)[] = [];

  const agentBot = ClientIdentity.parse({
    clientId: 'chatwoot-agent-bot-7',
    scopes: ['write:conversations'],
    activeOrganizationId: 'org-acme',
  });

  const callGateway = async (
    headers: Record<string, string>,
    identity: Identity | null = null,
    query = '{ whoami }',
    extensions?: Record<string, unknown>,
  ) => {
    received.clear();
    exchanged.length = 0;
    identities.caller = identity;
    const response = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ query, extensions }),
    });
    return response.json();
  };

  const boundTo = (organizationId?: string) =>
    UserIdentity.parse({
      userId: 'ana',
      email: 'ana@example.com',
      name: 'Ana',
      roles: ['user'],
      scopes: [],
      activeOrganizationId: organizationId,
    });

  beforeAll(async () => {
    sdlRoot = mkdtempSync(join(tmpdir(), 'gateway-subgraphs-'));
    const sources = [
      await subgraph('main-graph', 'whoami'),
      await subgraph('other', 'echo'),
      await subgraph('chatwoot', 'inbox'),
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
      .overrideProvider(ChatwootAgentBotTokens)
      .useValue({
        accessTokenFor: async (identity: Identity | null) => {
          exchanged.push(identity);
          return identity === agentBot ? 'bot-chatwoot-token' : undefined;
        },
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

  it('hands Chatwoot the agent bot’s own token for its platform token, and every other subgraph the bearer as it came', async () => {
    const body = await callGateway(
      { authorization: 'Bearer bot-platform-token', 'x-tenant': 'acme' },
      agentBot,
      '{ whoami echo inbox }',
    );

    expect(body).toEqual({
      data: { whoami: 'main-graph', echo: 'other', inbox: 'chatwoot' },
    });
    expect(received.get('chatwoot')).toMatchObject({
      api_access_token: 'bot-chatwoot-token',
      'x-tenant': 'acme',
    });
    expect(received.get('chatwoot')?.authorization).toBeUndefined();
    for (const name of ['main-graph', 'other']) {
      expect(received.get(name)?.authorization).toBe(
        'Bearer bot-platform-token',
      );
      expect(received.get(name)?.api_access_token).toBeUndefined();
    }
    expect(exchanged).toEqual([agentBot]);
  });

  it('forwards to Chatwoot whatever is not an agent bot’s token untouched', async () => {
    await callGateway(
      { authorization: 'Bearer a-user', cookie: 'session=abc' },
      null,
      '{ inbox }',
    );

    expect(received.get('chatwoot')).toMatchObject({
      authorization: 'Bearer a-user',
      cookie: 'session=abc',
    });
    expect(received.get('chatwoot')?.api_access_token).toBeUndefined();
  });

  it('never lets a caller choose the headers a subgraph is sent', async () => {
    await callGateway({ cookie: 'session=abc' }, null, '{ whoami inbox }', {
      headers: { api_access_token: 'forged', 'x-tenant': 'forged' },
    });

    for (const name of ['main-graph', 'chatwoot']) {
      expect(received.get(name)?.api_access_token).toBeUndefined();
      expect(received.get(name)?.['x-tenant']).toBeUndefined();
    }
  });

  it('serves the composed API schema for tooling', async () => {
    const response = await fetch(`${url}/graphql/schema.graphql`);

    await expect(response.text()).resolves.toContain('whoami: String!');
  });
});
