<script>
// Agent-assignment policy edit (thin-shell). AgentAssignmentEdit reads the policy
// id from the URL via useAppNavigation().currentParams and navigates via
// useAppNavigation().visit.
import { Head } from '@inertiajs/vue3';
import AgentAssignmentEdit from 'dashboard/routes/dashboard/settings/assignmentPolicy/pages/AgentAssignmentEditPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaAgentAssignmentEdit',
  components: { Head, AgentAssignmentEdit },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Assignment Policy" />
  <AgentAssignmentEdit />
</template>
