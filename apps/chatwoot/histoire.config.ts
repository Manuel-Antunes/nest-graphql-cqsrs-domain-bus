import { defineConfig } from 'histoire';
import { HstVue } from '@histoire/plugin-vue';

export default defineConfig({
  setupFile: './histoire.setup.ts',
  plugins: [HstVue()],
  collectMaxThreads: 4,
  vite: {
    server: {
      port: 6179,
    },
    // Story collection runs under vite-node (SSR). Several deps ship ESM as a directory
    // (e.g. @sentry/build/esm, @babel/runtime/helpers/esm, @twilio/voice-sdk/esm) whose
    // bare import Node's ESM loader can't resolve, breaking `histoire dev` collection.
    // Inline (transform) them instead of externalizing. NOTE: this list is not exhaustive
    // — collection still trips on further directory-ESM deps (@twilio/voice-sdk next); a
    // complete fix needs the full set here or a broader SSR-resolution strategy.
    ssr: {
      noExternal: [/@sentry/, /@babel\/runtime/],
    },
  },
  viteIgnorePlugins: ['vite-plugin-ruby'],
  theme: {
    darkClass: 'dark',
    title: '@chatwoot/design',
    logo: {
      square: './design-system/images/logo-thumbnail.svg',
      light: './design-system/images/logo.png',
      dark: './design-system/images/logo-dark.png',
    },
  },
  defaultStoryProps: {
    icon: 'carbon:cube',
    iconColor: '#1F93FF',
    layout: {
      type: 'grid',
      width: '80%',
    },
  },
  tree: {
    groups: [
      {
        id: 'top',
        title: '',
      },
      {
        id: 'components',
        title: 'Components',
        include: () => true,
      },
    ],
  },
});
