<script>
// Thin Inertia page (docs §2.1): help center is a full-bleed view, so it uses AppShell
// ALONE (no SettingsWrapper). Renders the EXISTING PortalsIndexPage landing/redirect
// component unchanged — it dispatches portals/index and then routes to the last active
// portal via useAppNavigation().visit. Reads :navigationPath from the URL. NO data props.
import { Head } from '@inertiajs/vue3';
import PortalsIndexPage from 'dashboard/routes/dashboard/helpcenter/pages/PortalsIndexPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';

export default {
  name: 'InertiaPortalsIndex',
  components: { Head, PortalsIndexPage },
  layout: AppShell,
};
</script>

<template>
  <Head title="Help Center" />
  <PortalsIndexPage />
</template>
