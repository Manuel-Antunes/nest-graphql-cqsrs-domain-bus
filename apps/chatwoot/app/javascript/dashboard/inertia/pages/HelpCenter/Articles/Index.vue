<script>
// Thin Inertia page (docs §2.1): serves BOTH portals_articles_index and
// portals_categories_articles_index — the child reads currentRouteName to switch its
// category vs. article header. AppShell alone (full-bleed help center). The SPA parent
// (HelpCenterPageRouteView) used to hydrate portal + categories + agents; under Inertia
// useHelpCenterBootstrap replays those dispatches. The component still self-fetches
// articles via Vuex — NO data props.
import { Head } from '@inertiajs/vue3';
import PortalsArticlesIndexPage from 'dashboard/routes/dashboard/helpcenter/pages/PortalsArticlesIndexPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useHelpCenterBootstrap } from 'dashboard/inertia/composables/useHelpCenterBootstrap';

export default {
  name: 'InertiaPortalsArticlesIndex',
  components: { Head, PortalsArticlesIndexPage },
  layout: AppShell,
  setup() {
    useHelpCenterBootstrap();
  },
};
</script>

<template>
  <Head title="Articles" />
  <PortalsArticlesIndexPage />
</template>
