<script>
// Thin Inertia page for team_reports_show. Renders the EXISTING TeamReportsShow
// component unchanged; it reads :id via useAppNavigation().currentParams and
// self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import TeamReportsShow from 'dashboard/routes/dashboard/settings/reports/TeamReportsShow.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsTeamShow',
  components: { Head, TeamReportsShow },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Team Report" />
  <TeamReportsShow />
</template>
