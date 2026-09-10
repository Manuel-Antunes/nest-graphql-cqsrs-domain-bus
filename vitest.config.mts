import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
import { coverage } from './vitest.coverage.mts';

/**
 * Vitest + SWC: é a receita da documentação do Nest (docs.nestjs.com/recipes/swc#vitest). O SWC entra
 * porque o esbuild do Vite não emite `emitDecoratorMetadata`, que a injeção de dependência do Nest
 * precisa. Vitest, e não Jest, porque o MikroORM v7 é ESM-only e o Jest não faz `require()` de ESM
 * no Node 22.
 */
export default defineConfig({
  test: {
    coverage,
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    testTimeout: 15000,
    hookTimeout: 30000,
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: { parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true } },
    }),
  ],
});
