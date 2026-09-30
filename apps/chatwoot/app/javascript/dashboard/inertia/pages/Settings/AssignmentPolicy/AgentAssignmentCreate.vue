<script>
// Agent-assignment policy create (thin-shell). AgentAssignmentCreate navigates
// to the edit page after a successful create via useAppNavigation().visit.
import { Head } from '@inertiajs/vue3';
import AgentAssignmentCreate from 'dashboard/routes/dashboard/settings/assignmentPolicy/pages/AgentAssignmentCreatePage.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaAgentAssignmentCreate',
  components: { Head, AgentAssignmentCreate },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Assignment Policy" />
  <AgentAssignmentCreate />
</template>
