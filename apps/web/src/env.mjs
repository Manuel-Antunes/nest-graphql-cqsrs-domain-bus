import { AuthEnvSchema } from '@nestposts/auth/config/auth-env.schema';
import { BillingEnvSchema } from '@nestposts/billing/config/billing-env.schema';
import { DatabaseEnvSchema } from '@nestposts/database/config/database-env.schema';
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

import { AppEnvSchema } from './nest/config/schemas/app-env.schema';
import { AwsEnvSchema } from './nest/config/schemas/aws-env.schema';
import { InngestEnvSchema } from './nest/config/schemas/inngest-env.schema';
import { OutboxEnvSchema } from './nest/config/schemas/outbox-env.schema';
import { RabbitmqEnvSchema } from './nest/config/schemas/rabbitmq-env.schema';
import { RedisEnvSchema } from './nest/config/schemas/redis-env.schema';
import { StorageEnvSchema } from './nest/config/schemas/storage-env.schema';

export const env = createEnv({
  server: {
    ...AppEnvSchema.shape,
    ...AuthEnvSchema.shape,
    ...BillingEnvSchema.shape,
    ...DatabaseEnvSchema.shape,
    ...AwsEnvSchema.shape,
    ...InngestEnvSchema.shape,
    ...OutboxEnvSchema.shape,
    ...RabbitmqEnvSchema.shape,
    ...RedisEnvSchema.shape,
    ...StorageEnvSchema.shape,
    POSTS_SUBGRAPH_URL: z.string().optional(),
    CHATWOOT_URL: z.string().min(1).default('http://localhost:3100'),
    THEO_AGENT_URL: z.url().default('http://localhost:8080/invocations'),
    POSTS_MCP_URL: z.url().default('http://localhost:8000/mcp'),
    POSTS_MCP_RESOURCE: z.url().default('http://localhost:8000/mcp'),
    THEO_AGENT_AUDIENCES: z
      .string()
      .default(
        'http://localhost:8080/,http://localhost:9000/,http://localhost:8000/mcp',
      )
      .transform((value) =>
        value
          .split(',')
          .map((audience) => audience.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url()).min(1)),
  },
  client: {
    NEXT_PUBLIC_API_URL: z.string().min(1).default('http://localhost:3000'),
    NEXT_PUBLIC_GATEWAY_URL: z
      .string()
      .min(1)
      .default('http://localhost:4000/graphql'),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().optional(),
    NEXT_PUBLIC_SENTRY_RELEASE: z.string().optional(),
  },
  shared: {
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
  },
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_GATEWAY_URL: process.env.NEXT_PUBLIC_GATEWAY_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_SENTRY_RELEASE: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  },
  emptyStringAsUndefined: true,
});
