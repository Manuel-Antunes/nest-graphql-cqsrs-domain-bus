<script>
// Thin Inertia page (docs §2.1): the categories list (portals_categories_index). AppShell
// alone. useHelpCenterBootstrap replays the SPA parent's portal/categories/agents hydration
// (the page reads portal.config.allowed_locales); it also self-fetches categories via Vuex.
// NO data props.
import { Head } from '@inertiajs/vue3';
import PortalsCategoriesIndexPage from 'dashboard/routes/dashboard/helpcenter/pages/PortalsCategoriesIndexPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useHelpCenterBootstrap } from 'dashboard/inertia/composables/useHelpCenterBootstrap';

export default {
  name: 'InertiaPortalsCategoriesIndex',
  components: { Head, PortalsCategoriesIndexPage },
  layout: AppShell,
  setup() {
    useHelpCenterBootstrap();
  },
};
</script>

<template>
  <Head title="Categories" />
  <PortalsCategoriesIndexPage />
</template>
