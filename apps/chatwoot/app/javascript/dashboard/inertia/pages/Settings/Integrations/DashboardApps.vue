<script>
import { Head } from '@inertiajs/vue3';
import DashboardApps from 'dashboard/routes/dashboard/settings/integrations/DashboardApps/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaIntegrationsDashboardApps',
  components: { Head, DashboardApps },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Dashboard Apps" />
  <DashboardApps />
</template>
