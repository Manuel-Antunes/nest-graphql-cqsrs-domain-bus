<script>
// Thin Inertia page for bot_reports. Renders the EXISTING BotReports component
// unchanged; it self-fetches via REST/Vuex.
import { Head } from '@inertiajs/vue3';
import BotReports from 'dashboard/routes/dashboard/settings/reports/BotReports.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ReportsWrapper from 'dashboard/inertia/layouts/ReportsWrapper.vue';

export default {
  name: 'InertiaReportsBot',
  components: { Head, BotReports },
  layout: [AppShell, ReportsWrapper],
};
</script>

<template>
  <Head title="Bot Reports" />
  <BotReports />
</template>
