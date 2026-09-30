<script>
// Thin Inertia page for label_reports_index. Renders the EXISTING LabelReportsIndex
// component unchanged; it self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import LabelReportsIndex from 'dashboard/routes/dashboard/settings/reports/LabelReportsIndex.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsLabelOverview',
  components: { Head, LabelReportsIndex },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Labels Overview" />
  <LabelReportsIndex />
</template>
