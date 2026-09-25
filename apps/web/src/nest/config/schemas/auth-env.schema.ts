import { z } from 'zod';

export const AuthEnvSchema = z.object({
  AUTH_URL: z.string().optional(),
  AUTH_BASE_PATH: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  AUTH_ISSUER: z.string().optional(),
  AUTH_OAUTH_RESOURCES: z.string().optional(),
  AUTH_TRUSTED_ORIGINS: z.string().optional(),
  AUTH_COOKIE_DOMAIN: z.string().optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),
  AUTH_REQUIRE_EMAIL_VERIFICATION: z.string().optional(),
  AUTH_RATE_LIMIT: z.string().optional(),
  GATEWAY_URL: z.string().optional(),
});
