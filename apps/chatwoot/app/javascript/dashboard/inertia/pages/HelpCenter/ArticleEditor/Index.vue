<script>
// Thin Inertia page (docs §2.1): serves BOTH portals_articles_edit and
// portals_categories_articles_edit — the child reads currentRouteName to pick the
// go-back route. AppShell alone. useHelpCenterBootstrap replays portal/categories/agents
// hydration; the component self-fetches the article via Vuex (articles/show). NO data props.
import { Head } from '@inertiajs/vue3';
import PortalsArticlesEditPage from 'dashboard/routes/dashboard/helpcenter/pages/PortalsArticlesEditPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useHelpCenterBootstrap } from 'dashboard/inertia/composables/useHelpCenterBootstrap';

export default {
  name: 'InertiaPortalsArticlesEdit',
  components: { Head, PortalsArticlesEditPage },
  layout: AppShell,
  setup() {
    useHelpCenterBootstrap();
  },
};
</script>

<template>
  <Head title="Edit Article" />
  <PortalsArticlesEditPage />
</template>
