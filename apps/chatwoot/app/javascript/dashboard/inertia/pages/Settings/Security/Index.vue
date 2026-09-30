<script>
// Thin Inertia page — renders the existing security settings component unchanged.
import { Head } from '@inertiajs/vue3';
import SecurityIndex from 'dashboard/routes/dashboard/settings/security/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaSecurityIndex',
  components: { Head, SecurityIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Security" />
  <SecurityIndex />
</template>
