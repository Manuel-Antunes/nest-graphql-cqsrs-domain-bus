/// <reference types="vitest" />

/**
What's going on with library mode?

Glad you asked, here's a quick rundown:

1. vite-plugin-ruby will automatically bring all the entrypoints like dashbord and widget as input to vite.
2. vite needs to be in library mode to build the SDK as a single file. (UMD) format and set `inlineDynamicImports` to true.
3. But when setting `inlineDynamicImports` to true, vite will not be able to handle mutliple entrypoints.

This puts us in a deadlock, now there are two ways around this, either add another separate build pipeline to
the app using vanilla rollup or rspack or something. The second option is to remove sdk building from the main pipeline
and build it separately using Vite itself, toggled by an ENV variable.

`BUILD_MODE=library bin/vite build` should build only the SDK and save it to `public/packs/js/sdk.js`
`bin/vite build` will build the rest of the app as usual. But exclude the SDK.

We need to edit the `asset:precompile` rake task to include the SDK in the precompile list.
*/
import { defineConfig } from 'vite';
import ruby from 'vite-plugin-ruby';
import path from 'path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isLibraryMode = process.env.BUILD_MODE === 'library';
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
let plugins = [ruby(), vue(vueOptions)];

if (isLibraryMode) {
  plugins = [vue(vueOptions)];
} else if (isTestMode) {
  plugins = [vue(vueOptions)];
}

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
  build: {
    rollupOptions: {
      output: {
        // [NOTE] when not in library mode, no new keys will be addedd or overwritten
        // setting dir: isLibraryMode ? 'public/packs' : undefined will not work
        ...(isLibraryMode
          ? {
              dir: 'public/packs',
              entryFileNames: chunkInfo => {
                if (chunkInfo.name === 'sdk') {
                  return 'js/sdk.js';
                }
                return '[name].js';
              },
            }
          : {}),
        inlineDynamicImports: isLibraryMode, // Disable code-splitting for SDK
      },
    },
    lib: isLibraryMode
      ? {
          entry: path.resolve(__dirname, './app/javascript/entrypoints/sdk.js'),
          formats: ['iife'], // IIFE format for single file
          name: 'sdk',
        }
      : undefined,
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
