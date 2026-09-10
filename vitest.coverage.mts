import type { ViteUserConfig } from 'vitest/config';

/**
 * Opções de cobertura compartilhadas pelos dois runners (unitário e e2e), para que os dois relatórios
 * falem do mesmo denominador e possam ser somados com `--merge-reports`.
 *
 * O que fica de fora do denominador não é "código sem teste", é código que não é lógica nossa:
 * barris de reexport (`index.ts`), arquivos só de tipo (`interfaces/`, `*.interface.ts`), o bootstrap
 * (`main.ts`) e as configurações. O resto — inclusive resolvers, mappers e DTOs — conta.
 */
export const coverage: NonNullable<NonNullable<ViteUserConfig['test']>['coverage']> = {
  provider: 'v8',
  all: true,
  include: ['src/**/*.ts'],
  exclude: [
    'src/**/*.spec.ts',
    'src/**/index.ts',
    'src/**/interfaces/**',
    'src/**/*.interface.ts',
    'src/main.ts',
    'src/infrastructure/persistence/sqlite/mikro-orm.config.ts',
  ],
  reporter: ['text', 'html', 'json', 'json-summary'],
  reportsDirectory: './coverage',
};
