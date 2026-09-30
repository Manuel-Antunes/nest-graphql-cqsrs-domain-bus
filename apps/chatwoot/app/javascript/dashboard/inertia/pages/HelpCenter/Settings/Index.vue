<script>
// Thin Inertia page (docs §2.1): the portal settings (portals_settings_index). AppShell
// alone. The child renders from the portals getters and has no onMounted fetch, so
// useHelpCenterBootstrap hydrates portal + categories + agents under Inertia. Slug changes
// and portal deletion navigate via useAppNavigation().visit. NO data props.
import { Head } from '@inertiajs/vue3';
import PortalsSettingsIndexPage from 'dashboard/routes/dashboard/helpcenter/pages/PortalsSettingsIndexPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useHelpCenterBootstrap } from 'dashboard/inertia/composables/useHelpCenterBootstrap';

export default {
  name: 'InertiaPortalsSettingsIndex',
  components: { Head, PortalsSettingsIndexPage },
  layout: AppShell,
  setup() {
    useHelpCenterBootstrap();
  },
};
</script>

<template>
  <Head title="Portal Settings" />
  <PortalsSettingsIndexPage />
</template>
