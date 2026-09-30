<script>
// Thin Inertia page — renders the existing sla settings component unchanged.
import { Head } from '@inertiajs/vue3';
import SlaIndex from 'dashboard/routes/dashboard/settings/sla/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaSlaIndex',
  components: { Head, SlaIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="SLA" />
  <SlaIndex />
</template>
