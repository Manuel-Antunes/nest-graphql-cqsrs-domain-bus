<script>
// Thin Inertia page for label_reports. Renders the EXISTING LabelReports component
// unchanged; it self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import LabelReports from 'dashboard/routes/dashboard/settings/reports/LabelReports.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsLabel',
  components: { Head, LabelReports },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Label Reports" />
  <LabelReports />
</template>
