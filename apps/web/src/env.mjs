import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

import { AppEnvSchema } from './nest/config/schemas/app-env.schema';
import { AuthEnvSchema } from './nest/config/schemas/auth-env.schema';
import { AwsEnvSchema } from './nest/config/schemas/aws-env.schema';
import { BillingEnvSchema } from './nest/config/schemas/billing-env.schema';
import { InngestEnvSchema } from './nest/config/schemas/inngest-env.schema';
import { PostgresEnvSchema } from './nest/config/schemas/postgres-env.schema';
import { RabbitmqEnvSchema } from './nest/config/schemas/rabbitmq-env.schema';

export const env = createEnv({
  server: {
    ...AppEnvSchema.shape,
    ...AuthEnvSchema.shape,
    ...AwsEnvSchema.shape,
    ...BillingEnvSchema.shape,
    ...InngestEnvSchema.shape,
    ...PostgresEnvSchema.shape,
    ...RabbitmqEnvSchema.shape,
    POSTS_SUBGRAPH_URL: z.string().optional(),
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
