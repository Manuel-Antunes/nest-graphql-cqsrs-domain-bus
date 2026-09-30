<script>
import { Head } from '@inertiajs/vue3';
import IntegrationsIndex from 'dashboard/routes/dashboard/settings/integrations/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaIntegrationsIndex',
  components: { Head, IntegrationsIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Integrations" />
  <IntegrationsIndex />
</template>
