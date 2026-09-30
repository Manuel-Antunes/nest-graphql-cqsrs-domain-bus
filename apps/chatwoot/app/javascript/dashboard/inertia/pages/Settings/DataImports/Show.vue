<script>
import { Head } from '@inertiajs/vue3';
import DataImportShow from 'dashboard/routes/dashboard/settings/data/Show.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaDataImportsShow',
  components: { Head, DataImportShow },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Data Import" />
  <DataImportShow />
</template>
