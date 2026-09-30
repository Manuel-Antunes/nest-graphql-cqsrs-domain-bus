<script>
// Team edit wizard — step 2 (thin-shell). EditStepWrap renders the step sidebar and
// the EditAgents component as its slot. EditAgents reads the team id from the URL via
// useAppNavigation().currentParams and navigates to the finish step via visit.
import { Head } from '@inertiajs/vue3';
import EditStepWrap from 'dashboard/routes/dashboard/settings/teams/Edit/Index.vue';
import EditAgents from 'dashboard/routes/dashboard/settings/teams/Edit/EditAgents.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaTeamsEditMembers',
  components: { Head, EditStepWrap, EditAgents },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Edit Team Agents" />
  <EditStepWrap>
    <EditAgents />
  </EditStepWrap>
</template>
