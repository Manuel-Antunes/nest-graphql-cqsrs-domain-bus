<script>
import { Head } from '@inertiajs/vue3';
import DataImportsIndex from 'dashboard/routes/dashboard/settings/data/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaDataImportsIndex',
  components: { Head, DataImportsIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Data" />
  <DataImportsIndex />
</template>
