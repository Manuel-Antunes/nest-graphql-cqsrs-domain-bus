import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const OAuthEnvSchema = z.object({
  WEB_URL: z.url().default('http://localhost:4200'),
  AUTH_ISSUER: z.url().optional(),
  AUTH_BASE_PATH: z.string().startsWith('/').default('/api/auth'),
  POSTS_AGENT_RESOURCE: z.url().default('http://localhost:9000/'),
});

export const oauthConfig = registerAs('oauth', () => {
  const parsed = OAuthEnvSchema.parse(process.env);
  const issuer = (parsed.AUTH_ISSUER ?? parsed.WEB_URL).replace(/\/+$/, '');
  return {
    issuer,
    authorizationServerMetadataUrl: `${issuer}/.well-known/oauth-authorization-server`,
    authorizationUrl: `${issuer}${parsed.AUTH_BASE_PATH}/oauth2/authorize`,
    tokenUrl: `${issuer}${parsed.AUTH_BASE_PATH}/oauth2/token`,
    audience: parsed.POSTS_AGENT_RESOURCE,
  };
});

export type OAuthConfig = ConfigType<typeof oauthConfig>;
