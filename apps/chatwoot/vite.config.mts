/// <reference types="vitest" />

import { defineConfig } from 'vite';
import ruby from 'vite-plugin-ruby';
import path from 'path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import yaml from '@rollup/plugin-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isTestMode = process.env.TEST === 'true';

// Tailwind v4 is generated (once) from the plain entrypoints/tailwind.css by the
// @tailwindcss/postcss plugin (see postcss.config.js). `@apply` only resolves
// utilities in scope for the stylesheet being compiled, and Sass files (roots,
// partials and SFC <style lang="scss"> blocks) compile as isolated stylesheets —
// so we inject a `@reference` to the SLIM tailwind-reference.css into each one
// that needs it. The slim reference omits the icon collections (the per-file
// OOM driver), so injecting it stays cheap.
const TW_REFERENCE = path.resolve(
  __dirname,
  'app/javascript/entrypoints/tailwind-reference.css'
);

// Only inject `@reference` into Sass that actually needs theme resolution: a
// stylesheet using `@apply`, or one with a Sass `@import` (a scss root pulling in
// partials that themselves `@apply`). The hundreds of plain component
// `<style scoped lang="scss">` blocks match neither and are skipped — that's what
// keeps @tailwindcss/postcss from rebuilding the theme per file and OOMing.
const needsTailwindReference = (source: string) =>
  /@apply\b/.test(source) || /@import\b/.test(source);

const vueOptions = {
  template: {
    compilerOptions: {
      isCustomElement: (tag: string) => ['ninja-keys'].includes(tag),
    },
  },
};

// Tailwind runs as a PostCSS plugin (postcss.config.js), not a Vite plugin, so
// it isn't listed here — Vite applies PostCSS to every CSS module after Sass.
const plugins = isTestMode
  ? [vue(vueOptions), yaml()]
  : [ruby(), vue(vueOptions), yaml()];

export default defineConfig({
  plugins: plugins,
  css: {
    preprocessorOptions: {
      scss: {
        // Vite 5 still defaults to the deprecated legacy Sass API, whose
        // importer can't fall back to the entry file's own directory. That
        // breaks sibling partial imports like `@import 'reset';` in woot.scss
        // ("Can't find stylesheet to import"). The modern compiler falls back
        // to filesystem resolution relative to the entry URL, so it resolves.
        api: 'modern-compiler',
        // The Chatwoot SCSS uses @import throughout; silence the (warning-only)
        // deprecation noise so the dev server output stays readable.
        silenceDeprecations: ['import', 'global-builtin', 'legacy-js-api'],
        // Inject Tailwind v4 `@reference` so `@apply` (and custom @utility like
        // field-base) resolves inside the Sass stylesheets that use it — SFC
        // <style scss> blocks with @apply, the scss roots, and partials inlined
        // into them. Skipped for plain component styles (see needsTailwindReference).
        additionalData: (source: string) =>
          needsTailwindReference(source)
            ? `@reference "${TW_REFERENCE}";\n${source}`
            : source,
      },
    },
  },
  resolve: {
    alias: {
      vue: 'vue/dist/vue.esm-bundler.js',
      components: path.resolve('./app/javascript/dashboard/components'),
      next: path.resolve('./app/javascript/dashboard/components-next'),
      v3: path.resolve('./app/javascript/v3'),
      dashboard: path.resolve('./app/javascript/dashboard'),
      helpers: path.resolve('./app/javascript/shared/helpers'),
      shared: path.resolve('./app/javascript/shared'),
      survey: path.resolve('./app/javascript/survey'),
      widget: path.resolve('./app/javascript/widget'),
      assets: path.resolve('./app/javascript/dashboard/assets'),
      'test-i18n': path.resolve('./vitest.i18n.js'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['app/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    coverage: {
      reporter: ['lcov', 'text'],
      include: ['app/**/*.js', 'app/**/*.vue'],
      exclude: [
        'app/**/*.@(spec|stories|routes).js',
        '**/specs/**/*',
        '**/i18n/**/*',
      ],
    },
    globals: true,
    outputFile: 'coverage/sonar-report.xml',
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
    server: {
      deps: {
        inline: ['tinykeys', '@material/mwc-icon'],
      },
    },
    setupFiles: ['fake-indexeddb/auto', 'vitest.setup.js'],
    mockReset: true,
    clearMocks: true,
  },
});
