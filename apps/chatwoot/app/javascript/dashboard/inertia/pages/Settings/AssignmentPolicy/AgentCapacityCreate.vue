<script>
// Agent-capacity policy create (thin-shell). AgentCapacityCreate navigates to the
// edit page after a successful create via useAppNavigation().visit.
import { Head } from '@inertiajs/vue3';
import AgentCapacityCreate from 'dashboard/routes/dashboard/settings/assignmentPolicy/pages/AgentCapacityCreatePage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaAgentCapacityCreate',
  components: { Head, AgentCapacityCreate },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Capacity Policy" />
  <AgentCapacityCreate />
</template>
