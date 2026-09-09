import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/** Os e2e sobem a aplicação inteira (Fastify + Mercurius + SQLite em memória) e falam com ela por HTTP e WebSocket. */
export default defineConfig({
  resolve: {
    alias: {
      '@app/cqsrs': new URL('./libs/cqsrs/src', import.meta.url).pathname,
      '@app/messaging': new URL('./libs/messaging/src', import.meta.url).pathname,
      '@app/order': new URL('./libs/order/src', import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    root: './',
    include: ['apps/**/test/**/*.e2e-spec.ts', 'test/**/*.e2e-spec.ts'],
    env: { POSTS_DB: ':memory:' },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: { parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true } },
    }),
  ],
});
