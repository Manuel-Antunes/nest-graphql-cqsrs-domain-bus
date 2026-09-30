<script>
// Thin Inertia page for inbox_reports. Renders the EXISTING InboxReports component
// unchanged; it self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import InboxReports from 'dashboard/routes/dashboard/settings/reports/InboxReports.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsInbox',
  components: { Head, InboxReports },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Inbox Reports" />
  <InboxReports />
</template>
