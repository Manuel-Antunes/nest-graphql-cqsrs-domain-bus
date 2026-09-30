<script>
import { Head } from '@inertiajs/vue3';
import Linear from 'dashboard/routes/dashboard/settings/integrations/Linear.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaIntegrationsLinear',
  components: { Head, Linear },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Linear" />
  <Linear />
</template>
