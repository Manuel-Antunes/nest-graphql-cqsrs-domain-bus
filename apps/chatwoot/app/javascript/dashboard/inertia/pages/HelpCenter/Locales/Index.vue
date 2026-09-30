<script>
// Thin Inertia page (docs §2.1): the locales list (portals_locales_index). AppShell alone.
// The child renders straight from the portals/portalBySlug getter and does NO fetch of its
// own, so useHelpCenterBootstrap (portal + categories + agents hydration) is what populates
// it under Inertia. NO data props.
import { Head } from '@inertiajs/vue3';
import PortalsLocalesIndexPage from 'dashboard/routes/dashboard/helpcenter/pages/PortalsLocalesIndexPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import { useHelpCenterBootstrap } from 'dashboard/inertia/composables/useHelpCenterBootstrap';

export default {
  name: 'InertiaPortalsLocalesIndex',
  components: { Head, PortalsLocalesIndexPage },
  layout: AppShell,
  setup() {
    useHelpCenterBootstrap();
  },
};
</script>

<template>
  <Head title="Locales" />
  <PortalsLocalesIndexPage />
</template>
