<script>
// Thin Inertia page (docs §2.1): sets the persistent layout stack + document title,
// and renders the EXISTING labels component completely unchanged. The component
// still fetches via store.dispatch('labels/get') (REST) — no data props, no rewrite.
import { Head } from '@inertiajs/vue3';
import LabelsIndex from 'dashboard/routes/dashboard/settings/labels/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaLabelsIndex',
  components: { Head, LabelsIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Labels" />
  <LabelsIndex />
</template>
