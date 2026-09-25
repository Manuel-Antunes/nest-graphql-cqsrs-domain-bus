import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { AuthConfiguration } from '@nestposts/auth/infrastructure/better-auth/config';

export const authConfig = registerAs('auth', () =>
  AuthConfiguration.fromEnvironment(process.env),
);

export type AuthConfig = ConfigType<typeof authConfig>;
