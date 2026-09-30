<script>
// Thin Inertia page — renders the existing canned component unchanged.
import { Head } from '@inertiajs/vue3';
import CannedIndex from 'dashboard/routes/dashboard/settings/canned/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaCannedIndex',
  components: { Head, CannedIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Canned Responses" />
  <CannedIndex />
</template>
