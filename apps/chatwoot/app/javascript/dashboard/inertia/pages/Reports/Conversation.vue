<script>
// Thin Inertia page for conversation_reports. Renders the EXISTING ConversationReports
// component (reports/Index.vue) unchanged; it self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import ConversationReports from 'dashboard/routes/dashboard/settings/reports/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsConversation',
  components: { Head, ConversationReports },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Conversation Reports" />
  <ConversationReports />
</template>
