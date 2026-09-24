import { join } from 'node:path';
import type { SubgraphSource } from '@nestposts/federation-gateway';
import { JwksGatewayTokenVerifier } from '@nestposts/federation-gateway';

const DEFAULT_WEB_URL = 'http://localhost:4200';

const csv = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export const gatewayPort = (): number =>
  Number(process.env.GATEWAY_PORT ?? process.env.PORT ?? 4000);

export const gatewayUrl = (): string =>
  process.env.GATEWAY_URL ?? `http://localhost:${gatewayPort()}/graphql`;

const subgraphSdlRoot = (): string =>
  process.env.GATEWAY_SUBGRAPHS_DIR ?? join(__dirname, 'subgraphs');

export const gatewaySubgraphs = (): SubgraphSource[] => [
  {
    name: 'posts',
    url: process.env.POSTS_SUBGRAPH_URL ?? 'http://localhost:3000/graphql',
    sdlDir: join(subgraphSdlRoot(), 'posts'),
  },
  {
    name: 'notifications',
    url:
      process.env.NOTIFICATIONS_SUBGRAPH_URL ?? 'http://localhost:3002/graphql',
    sdlDir: join(subgraphSdlRoot(), 'notifications'),
  },
];

export const browserOrigins = (): string[] =>
  csv(
    process.env.GATEWAY_CORS_ORIGINS ?? process.env.WEB_URL ?? DEFAULT_WEB_URL,
  );

export const gatewayTokenVerifier = (): JwksGatewayTokenVerifier =>
  new JwksGatewayTokenVerifier({
    jwksUrl:
      process.env.AUTH_JWKS_URL ??
      `${process.env.AUTH_URL ?? 'http://localhost:3000'}/api/auth/jwks`,
    issuer: process.env.AUTH_ISSUER ?? process.env.WEB_URL ?? DEFAULT_WEB_URL,
    audience: gatewayUrl(),
  });
