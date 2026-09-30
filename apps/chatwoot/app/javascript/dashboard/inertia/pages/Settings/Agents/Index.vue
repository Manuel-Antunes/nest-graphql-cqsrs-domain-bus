<script>
import { Head } from '@inertiajs/vue3';
import AgentHome from 'dashboard/routes/dashboard/settings/agents/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaAgentsIndex',
  components: { Head, AgentHome },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Agents" />
  <AgentHome />
</template>
