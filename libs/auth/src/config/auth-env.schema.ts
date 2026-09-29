import { z } from 'zod';

const CommaSeparatedSchema = z.string().transform((value) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean),
);

export const AuthEnvSchema = z.object({
  AUTH_URL: z.url().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  AUTH_BASE_PATH: z.string().startsWith('/').default('/api/auth'),
  AUTH_SECRET: z
    .string()
    .min(1)
    .default('nest-graphql-posts-dev-secret-nao-use-em-producao'),
  WEB_URL: z.url().default('http://localhost:4200'),
  AUTH_ISSUER: z.url().optional(),
  GATEWAY_URL: z.url().default('http://localhost:4000/graphql'),
  AUTH_OAUTH_RESOURCES: CommaSeparatedSchema.pipe(
    z.array(z.url()).min(1),
  ).optional(),
  AUTH_TRUSTED_ORIGINS: CommaSeparatedSchema.optional(),
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  AUTH_REQUIRE_EMAIL_VERIFICATION: z.stringbool().default(true),
  AUTH_RATE_LIMIT: z.stringbool().default(true),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),
  NODE_ENV: z.string().optional(),
});
