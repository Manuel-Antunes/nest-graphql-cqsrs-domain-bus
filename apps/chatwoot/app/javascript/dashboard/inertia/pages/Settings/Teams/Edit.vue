<script>
// Team edit wizard — step 1 (thin-shell). EditStepWrap renders the woot-wizard step
// sidebar (active step read via useAppNavigation().currentRouteName) and the EditTeam
// form as its slot. EditTeam reads the team id from the URL via
// useAppNavigation().currentParams and navigates to the edit-agents step via visit.
import { Head } from '@inertiajs/vue3';
import EditStepWrap from 'dashboard/routes/dashboard/settings/teams/Edit/Index.vue';
import EditTeam from 'dashboard/routes/dashboard/settings/teams/Edit/EditTeam.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaTeamsEdit',
  components: { Head, EditStepWrap, EditTeam },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Edit Team" />
  <EditStepWrap>
    <EditTeam />
  </EditStepWrap>
</template>
