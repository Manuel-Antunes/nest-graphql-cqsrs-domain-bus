<script>
// Team create wizard — step 2 (thin-shell). CreateStepWrap renders the step sidebar
// and the AddAgents component as its slot. AddAgents reads the team id from the URL
// via useAppNavigation().currentParams and navigates to the finish step via visit.
import { Head } from '@inertiajs/vue3';
import CreateStepWrap from 'dashboard/routes/dashboard/settings/teams/Create/Index.vue';
import AddAgents from 'dashboard/routes/dashboard/settings/teams/Create/AddAgents.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaTeamsAddAgents',
  components: { Head, CreateStepWrap, AddAgents },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Add Agents" />
  <CreateStepWrap>
    <AddAgents />
  </CreateStepWrap>
</template>
