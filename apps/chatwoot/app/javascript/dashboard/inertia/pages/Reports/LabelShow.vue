<script>
// Thin Inertia page for label_reports_show. Renders the EXISTING LabelReportsShow
// component unchanged; it reads :id via useAppNavigation().currentParams and
// self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import LabelReportsShow from 'dashboard/routes/dashboard/settings/reports/LabelReportsShow.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsLabelShow',
  components: { Head, LabelReportsShow },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Label Report" />
  <LabelReportsShow />
</template>
