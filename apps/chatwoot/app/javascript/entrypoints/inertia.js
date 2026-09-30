// Inertia entrypoint for migrated dashboard pages (settings/CRUD). Mirrors the
// plugin/component/directive setup of entrypoints/dashboard.js so existing Vue
// components render unchanged, but mounts pages via Inertia instead of vue-router.
// Automatic per-page code-splitting comes from the lazy import.meta.glob below.
import './tailwind.css';
// The SPA loads these global styles via App.vue's <style> blocks; the Inertia app has
// no App.vue, so import the same bundles here or components render unstyled.
import 'dashboard/assets/scss/app.scss';
import 'vue-multiselect/dist/vue-multiselect.css';
import 'flag-icons/css/flag-icons.min.css';
import { createApp, h } from 'vue';
import { createInertiaApp } from '@inertiajs/vue3';

import axios from 'axios';
import hljsVuePlugin from '@highlightjs/vue-plugin';
import Multiselect from 'vue-multiselect';
import { plugin as formkitPlugin, defaultConfig } from '@formkit/vue';
import WootWizard from 'components/ui/Wizard.vue';
import FloatingVue from 'floating-vue';
import WootUiKit from 'dashboard/components';
import { i18n } from 'dashboard/i18n/instance';
import createAxios from 'dashboard/helper/APIHelper';
import commonHelpers, { isJSONValid } from 'dashboard/helper/commons';
import { createPinia } from 'pinia';
import store from 'dashboard/store';
import constants from 'dashboard/constants/globals';
import FluentIcon from 'shared/components/FluentIcon/DashboardIcon.vue';
import VueDOMPurifyHTML from 'vue-dompurify-html';
import { domPurifyConfig } from 'shared/helpers/HTMLSanitizer.js';
import { vResizeObserver } from '@vueuse/components';
import { directive as onClickaway } from 'vue3-click-away';
import { DefaultApolloClient } from '@vue/apollo-composable';
import { apolloClient } from '../../graphql/apollo-client';
import * as Sentry from '@sentry/vue';
import {
  ensureWebMcp,
  startIframeBridge,
  registerWebMcpTools,
} from 'dashboard/composables/webMcp';
import {
  initializeAnalyticsEvents,
  initializeChatwootEvents,
} from 'dashboard/helper/scriptHelpers.js';
import { setupInertiaIframeBridge } from 'dashboard/helper/inertiaIframeBridge';

import 'floating-vue/dist/style.css';

import AppShell from 'dashboard/inertia/layouts/AppShell.vue';

// Same global bootstrap as dashboard.js: axios instance carries the auth headers
// from the cookie; common helpers + constants populated on window.
commonHelpers();
window.WootConstants = constants;
window.axios = createAxios(axios);

const pinia = createPinia();

createInertiaApp({
  title: title => (title ? `${title} - Chatwoot` : 'Chatwoot'),
  resolve: name => {
    // No { eager: true } → each page is its own lazily-loaded chunk (code-split).
    const pages = import.meta.glob('../dashboard/inertia/pages/**/*.vue');
    const page = pages[`../dashboard/inertia/pages/${name}.vue`];
    if (!page) {
      throw new Error(`[inertia] page not found: ${name}`);
    }
    return page().then(module => {
      module.default.layout = module.default.layout ?? AppShell;
      return module;
    });
  },
  setup({ el, App, props, plugin }) {
    const app = createApp({ render: () => h(App, props) });

    app.use(plugin);
    app.use(i18n);
    app.use(store);
    app.use(pinia);
    app.provide(DefaultApolloClient, apolloClient);

    // Error tracking — same as the SPA's dashboard.js, minus the vue-router tracing
    // integration (Inertia has no vue-router; browser tracing still works without it).
    if (window.errorLoggingConfig) {
      Sentry.init({
        app,
        dsn: window.errorLoggingConfig,
        denyUrls: [
          /^chrome:\/\//i,
          /chrome-extension:/i,
          /extensions\//i,
          /file:\/\//i,
          /safari-web-extension:/i,
          /safari-extension:/i,
        ],
        integrations: [Sentry.browserTracingIntegration()],
        ignoreErrors: [
          'ResizeObserver loop completed with undelivered notifications',
        ],
      });
    }
    app.use(VueDOMPurifyHTML, domPurifyConfig);
    app.use(WootUiKit);
    app.use(
      formkitPlugin,
      defaultConfig({ rules: { JSON: ({ value }) => isJSONValid(value) } })
    );
    app.use(FloatingVue, {
      instantMove: true,
      arrowOverflow: false,
      disposeTimeout: 5000000,
    });
    app.use(hljsVuePlugin);

    app.component('multiselect', Multiselect);
    app.component('woot-wizard', WootWizard);
    app.component('fluent-icon', FluentIcon);

    app.directive('resize', vResizeObserver);
    app.directive('on-clickaway', onClickaway);

    app.mount(el);

    // Microfrontend + analytics bootstrap that used to live only in the SPA's
    // dashboard.js. All feature routes now render via Inertia, so these must run here or
    // the apps/web embedding (webMcp iframe bridge), analytics, and widget events are lost.
    initializeChatwootEvents();
    initializeAnalyticsEvents();
    const webMcpRegistry = ensureWebMcp();
    registerWebMcpTools({ apolloClient });
    startIframeBridge(webMcpRegistry);
    // Mirror Inertia navigation to the apps/web host URL (microfrontend), replacing the
    // vue-router afterEach the SPA teardown removed.
    setupInertiaIframeBridge();
  },
});
