import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const AuthEnvSchema = z.object({
  AUTH_JWKS_URL: z.string().optional(),
  AUTH_URL: z.string().min(1).default('http://localhost:3000'),
  AUTH_ISSUER: z.string().optional(),
  WEB_URL: z.string().min(1).default('http://localhost:4200'),
});

export const authConfig = registerAs('auth', () => {
  const parsed = AuthEnvSchema.parse(process.env);
  return {
    jwksUrl: parsed.AUTH_JWKS_URL || `${parsed.AUTH_URL}/api/auth/jwks`,
    issuer: parsed.AUTH_ISSUER || parsed.WEB_URL,
  };
});

export type AuthConfig = ConfigType<typeof authConfig>;
