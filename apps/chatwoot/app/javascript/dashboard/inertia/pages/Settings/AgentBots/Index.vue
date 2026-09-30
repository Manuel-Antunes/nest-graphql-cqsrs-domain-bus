<script>
// Thin Inertia page — renders the existing agentBots component unchanged.
import { Head } from '@inertiajs/vue3';
import AgentBotsIndex from 'dashboard/routes/dashboard/settings/agentBots/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaAgentBotsIndex',
  components: { Head, AgentBotsIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Agent Bots" />
  <AgentBotsIndex />
</template>
