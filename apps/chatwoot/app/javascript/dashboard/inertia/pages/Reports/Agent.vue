<script>
// Thin Inertia page for agent_reports. Renders the EXISTING AgentReports component
// unchanged; it self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import AgentReports from 'dashboard/routes/dashboard/settings/reports/AgentReports.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsAgent',
  components: { Head, AgentReports },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Agent Reports" />
  <AgentReports />
</template>
