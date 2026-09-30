<script>
// Thin Inertia page for sla_reports. Renders the EXISTING SLAReports component
// unchanged; it self-fetches via REST/Vuex (its own mounted()).
import { Head } from '@inertiajs/vue3';
import SLAReports from 'dashboard/routes/dashboard/settings/reports/SLAReports.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsSla',
  components: { Head, SLAReports },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="SLA Reports" />
  <SLAReports />
</template>
