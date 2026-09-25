import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { AuthConfiguration } from '@nestposts/auth/infrastructure/better-auth/config';

import { env } from '@/env.mjs';

export const authConfig = registerAs('auth', () => ({
  ...AuthConfiguration.fromEnvironment({
    AUTH_URL: env.AUTH_URL,
    AUTH_BASE_PATH: env.AUTH_BASE_PATH,
    AUTH_SECRET: env.AUTH_SECRET,
    AUTH_ISSUER: env.AUTH_ISSUER,
    AUTH_OAUTH_RESOURCES: env.AUTH_OAUTH_RESOURCES,
    AUTH_TRUSTED_ORIGINS: env.AUTH_TRUSTED_ORIGINS,
    AUTH_COOKIE_DOMAIN: env.AUTH_COOKIE_DOMAIN,
    AUTH_GOOGLE_ID: env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: env.AUTH_GOOGLE_SECRET,
    AUTH_GITHUB_ID: env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: env.AUTH_GITHUB_SECRET,
    AUTH_REQUIRE_EMAIL_VERIFICATION: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
    AUTH_RATE_LIMIT: env.AUTH_RATE_LIMIT,
    GATEWAY_URL: env.GATEWAY_URL,
    WEB_URL: env.WEB_URL,
    NODE_ENV: env.NODE_ENV,
  }),
  baseUrl: env.WEB_URL,
  trustedOrigins: [env.WEB_URL],
}));

export type AuthConfig = ConfigType<typeof authConfig>;
