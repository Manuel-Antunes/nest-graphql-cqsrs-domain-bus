<script>
// Thin Inertia page for team_reports. Renders the EXISTING TeamReports component
// unchanged; it self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import TeamReports from 'dashboard/routes/dashboard/settings/reports/TeamReports.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsTeam',
  components: { Head, TeamReports },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Team Reports" />
  <TeamReports />
</template>
