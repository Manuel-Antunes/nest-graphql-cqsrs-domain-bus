<script>
// Thin Inertia page — renders the existing automation component unchanged.
import { Head } from '@inertiajs/vue3';
import AutomationIndex from 'dashboard/routes/dashboard/settings/automation/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaAutomationIndex',
  components: { Head, AutomationIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Automation" />
  <AutomationIndex />
</template>
