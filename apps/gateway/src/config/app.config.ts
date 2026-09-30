import { join } from 'node:path';
import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

import type { SubgraphSource } from '../supergraph/supergraph';

const AppEnvSchema = z.object({
  OTEL_SERVICE_NAME: z.string().min(1).default('gateway'),
  LOG_LEVEL: z.string().min(1).default('info'),
  GATEWAY_PORT: z.coerce.number().int().positive().optional(),
  PORT: z.coerce.number().int().positive().default(4000),
  GATEWAY_SUBGRAPHS_DIR: z.string().optional(),
  POSTS_SUBGRAPH_URL: z
    .string()
    .min(1)
    .default('http://localhost:3000/graphql'),
  NOTIFICATIONS_SUBGRAPH_URL: z
    .string()
    .min(1)
    .default('http://localhost:3002/graphql'),
  CHATWOOT_SUBGRAPH_URL: z
    .string()
    .min(1)
    .default('http://localhost:3100/graphql'),
  GATEWAY_CORS_ORIGINS: z.string().optional(),
  WEB_URL: z.string().min(1).default('http://localhost:4200'),
});

export const appConfig = registerAs('app', () => {
  const parsed = AppEnvSchema.parse(process.env);
  const port = parsed.GATEWAY_PORT ?? parsed.PORT;
  const sdlRoot = parsed.GATEWAY_SUBGRAPHS_DIR ?? join(__dirname, 'subgraphs');
  const subgraphs: SubgraphSource[] = [
    {
      name: 'posts',
      url: parsed.POSTS_SUBGRAPH_URL,
      sdlDir: join(sdlRoot, 'posts'),
    },
    {
      name: 'notifications',
      url: parsed.NOTIFICATIONS_SUBGRAPH_URL,
      sdlDir: join(sdlRoot, 'notifications'),
    },
    {
      name: 'chatwoot',
      url: parsed.CHATWOOT_SUBGRAPH_URL,
      sdlDir: join(sdlRoot, 'chatwoot'),
    },
  ];
  return {
    serviceName: parsed.OTEL_SERVICE_NAME,
    logLevel: parsed.LOG_LEVEL,
    port,
    subgraphs,
    corsOrigins: (parsed.GATEWAY_CORS_ORIGINS ?? parsed.WEB_URL)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
