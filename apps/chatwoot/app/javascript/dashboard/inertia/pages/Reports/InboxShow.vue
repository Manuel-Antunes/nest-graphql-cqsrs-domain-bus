<script>
// Thin Inertia page for inbox_reports_show. Renders the EXISTING InboxReportsShow
// component unchanged; it reads :id via useAppNavigation().currentParams and
// self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import InboxReportsShow from 'dashboard/routes/dashboard/settings/reports/InboxReportsShow.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsInboxShow',
  components: { Head, InboxReportsShow },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Inbox Report" />
  <InboxReportsShow />
</template>
