<script>
// Thin Inertia page for team_reports_index. Renders the EXISTING TeamReportsIndex
// component unchanged; it self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import TeamReportsIndex from 'dashboard/routes/dashboard/settings/reports/TeamReportsIndex.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsTeamOverview',
  components: { Head, TeamReportsIndex },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Teams Overview" />
  <TeamReportsIndex />
</template>
