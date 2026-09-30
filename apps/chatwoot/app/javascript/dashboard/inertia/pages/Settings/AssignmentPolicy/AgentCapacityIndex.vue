<script>
// Agent-capacity policy list (thin-shell). The "Create" button + row "Edit"
// actions navigate via useAppNavigation().visit. Fetches via
// store.dispatch('agentCapacityPolicies/get') (REST), unchanged.
import { Head } from '@inertiajs/vue3';
import AgentCapacityIndex from 'dashboard/routes/dashboard/settings/assignmentPolicy/pages/AgentCapacityIndexPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaAgentCapacityIndex',
  components: { Head, AgentCapacityIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Capacity Policy" />
  <AgentCapacityIndex />
</template>
