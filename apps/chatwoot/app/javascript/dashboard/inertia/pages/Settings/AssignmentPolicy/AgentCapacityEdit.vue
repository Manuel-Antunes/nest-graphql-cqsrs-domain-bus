<script>
// Agent-capacity policy edit (thin-shell). AgentCapacityEdit reads the policy id
// from the URL via useAppNavigation().currentParams and navigates via
// useAppNavigation().visit.
import { Head } from '@inertiajs/vue3';
import AgentCapacityEdit from 'dashboard/routes/dashboard/settings/assignmentPolicy/pages/AgentCapacityEditPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaAgentCapacityEdit',
  components: { Head, AgentCapacityEdit },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Capacity Policy" />
  <AgentCapacityEdit />
</template>
