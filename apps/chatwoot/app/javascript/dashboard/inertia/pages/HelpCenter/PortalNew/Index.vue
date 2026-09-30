<script>
// Thin Inertia page (docs §2.1): the portal empty/create state. AppShell alone
// (full-bleed help center). Renders the EXISTING PortalsNewPage → PortalEmptyState,
// whose "Create portal" flow navigates via useAppNavigation().visit. NO data props.
import { Head } from '@inertiajs/vue3';
import PortalsNewPage from 'dashboard/routes/dashboard/helpcenter/pages/PortalsNewPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';

export default {
  name: 'InertiaPortalsNew',
  components: { Head, PortalsNewPage },
  layout: AppShell,
};
</script>

<template>
  <Head title="New Portal" />
  <PortalsNewPage />
</template>
