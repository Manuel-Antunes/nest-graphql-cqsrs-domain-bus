<script>
import { Head } from '@inertiajs/vue3';
import TemplatesIndex from 'dashboard/routes/dashboard/settings/templates/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaTemplatesIndex',
  components: { Head, TemplatesIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Templates" />
  <TemplatesIndex />
</template>
