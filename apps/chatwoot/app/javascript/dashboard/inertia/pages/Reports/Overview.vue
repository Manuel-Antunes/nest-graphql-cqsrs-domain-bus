<script>
// Thin Inertia page for account_overview_reports. Renders the EXISTING LiveReports
// component unchanged (it + its children self-fetch via REST/Vuex). Full-bleed:
// AppShell + the reports wrapper (max-width + multiselect/datepicker styles), NOT
// SettingsWrapper.
import { Head } from '@inertiajs/vue3';
import LiveReports from 'dashboard/routes/dashboard/settings/reports/LiveReports.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsOverview',
  components: { Head, LiveReports },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Overview Reports" />
  <LiveReports />
</template>
