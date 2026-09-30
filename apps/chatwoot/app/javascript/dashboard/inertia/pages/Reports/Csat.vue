<script>
// Thin Inertia page for csat_reports. Renders the EXISTING CsatResponses component
// unchanged; it self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import CsatResponses from 'dashboard/routes/dashboard/settings/reports/CsatResponses.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsCsat',
  components: { Head, CsatResponses },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="CSAT Reports" />
  <CsatResponses />
</template>
