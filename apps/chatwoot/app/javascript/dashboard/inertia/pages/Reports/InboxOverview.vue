<script>
// Thin Inertia page for inbox_reports_index. Renders the EXISTING InboxReportsIndex
// component unchanged; it self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import InboxReportsIndex from 'dashboard/routes/dashboard/settings/reports/InboxReportsIndex.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsInboxOverview',
  components: { Head, InboxReportsIndex },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Inboxes Overview" />
  <InboxReportsIndex />
</template>
