<script>
// Agent-assignment policy list (thin-shell). The "Create" button + row "Edit"
// actions navigate via useAppNavigation().visit. Fetches via
// store.dispatch('assignmentPolicies/get') (REST), unchanged.
import { Head } from '@inertiajs/vue3';
import AgentAssignmentIndex from 'dashboard/routes/dashboard/settings/assignmentPolicy/pages/AgentAssignmentIndexPage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaAgentAssignmentIndex',
  components: { Head, AgentAssignmentIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Assignment Policy" />
  <AgentAssignmentIndex />
</template>
