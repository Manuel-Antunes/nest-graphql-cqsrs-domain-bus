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
  transpilePackages: [
    '@nestposts/ui',
    '@mikro-orm/core',
    '@mikro-orm/postgresql',
    'pg',
  ],
  serverExternalPackages: [
    'ssh2',
    'msw/node',
    '@nestjs/cache-manager',
    '@nestjs-modules/mailer',
    'react-email',
    'pino',
    'pino-pretty',
    '@nestjs/typeorm',
  ],
  experimental: {
    turbopackMinify: false,
  },
  turbopack: {
    resolveAlias: Object.fromEntries(
      [
        '@nestjs/websockets/socket-module.js',
        '@nats-io/transport-node',
        'ioredis',
        'kafkajs',
        'mqtt',
      ].map((optional) => [optional, './src/nest/absent-optional-package.ts']),
    ),
  },
};

export default nextConfig;
