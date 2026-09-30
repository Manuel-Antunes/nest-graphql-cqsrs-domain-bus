<script>
import { Head } from '@inertiajs/vue3';
import Notion from 'dashboard/routes/dashboard/settings/integrations/Notion.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaIntegrationsNotion',
  components: { Head, Notion },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Notion" />
  <Notion />
</template>
