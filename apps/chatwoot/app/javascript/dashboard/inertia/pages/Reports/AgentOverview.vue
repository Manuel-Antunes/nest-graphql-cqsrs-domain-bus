<script>
// Thin Inertia page for agent_reports_index. Renders the EXISTING AgentReportsIndex
// component unchanged; it self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import AgentReportsIndex from 'dashboard/routes/dashboard/settings/reports/AgentReportsIndex.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsAgentOverview',
  components: { Head, AgentReportsIndex },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Agents Overview" />
  <AgentReportsIndex />
</template>
