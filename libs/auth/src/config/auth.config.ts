import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

import { AuthEnvSchema } from './auth-env.schema';

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

export const authConfig = registerAs('auth', () => {
  const env = AuthEnvSchema.parse(process.env);
  const baseUrl = env.AUTH_URL ?? `http://localhost:${env.PORT}`;
  const deployed =
    env.NODE_ENV === 'production' &&
    !LOOPBACK_HOSTS.includes(new URL(baseUrl).hostname);
  return {
    baseUrl,
    basePath: env.AUTH_BASE_PATH,
    secret: env.AUTH_SECRET,
    webUrl: env.WEB_URL,
    issuer: env.AUTH_ISSUER ?? env.WEB_URL,
    oauthResources: env.AUTH_OAUTH_RESOURCES ?? [env.GATEWAY_URL],
    trustedOrigins: [
      ...new Set(env.AUTH_TRUSTED_ORIGINS ?? [baseUrl, env.WEB_URL]),
    ],
    cookieDomain: deployed ? env.AUTH_COOKIE_DOMAIN || undefined : undefined,
    secure: deployed,
    requireEmailVerification: env.AUTH_REQUIRE_EMAIL_VERIFICATION,
    rateLimit: env.AUTH_RATE_LIMIT,
    google:
      env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
        ? { clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }
        : null,
    github:
      env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET
        ? { clientId: env.AUTH_GITHUB_ID, clientSecret: env.AUTH_GITHUB_SECRET }
        : null,
  };
});

export type AuthConfig = ConfigType<typeof authConfig>;
