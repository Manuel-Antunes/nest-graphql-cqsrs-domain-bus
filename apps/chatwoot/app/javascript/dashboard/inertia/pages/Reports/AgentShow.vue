<script>
// Thin Inertia page for agent_reports_show. Renders the EXISTING AgentReportsShow
// component unchanged; it reads :id via useAppNavigation().currentParams and
// self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import AgentReportsShow from 'dashboard/routes/dashboard/settings/reports/AgentReportsShow.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsAgentShow',
  components: { Head, AgentReportsShow },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Agent Report" />
  <AgentReportsShow />
</template>
