import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const monorepoRoot = path.resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ['@mikro-orm/core', '@mikro-orm/postgresql', 'pg'],
  serverExternalPackages: [
    'ssh2',
    'msw/node',
    '@nestjs/cache-manager',
    '@nestjs/microservices',
    '@nestjs-modules/mailer',
    '@react-email/components',
    'pino',
    'pino-pretty',
    '@nestjs/typeorm',
  ],
  experimental: {
    turbopackMinify: false,
  },
  turbopack: {
    resolveAlias: {
      '@nestjs/websockets/socket-module.js':
        './src/nest/absent-optional-package.ts',
    },
  },
};

export default nextConfig;
