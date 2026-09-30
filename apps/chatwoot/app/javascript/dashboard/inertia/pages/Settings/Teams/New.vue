<script>
// Team create wizard — step 1 (thin-shell). CreateStepWrap renders the woot-wizard
// step sidebar (active step read via useAppNavigation().currentRouteName) and the
// CreateTeam form as its slot. CreateTeam navigates to the add-agents step after a
// successful create via useAppNavigation().visit.
import { Head } from '@inertiajs/vue3';
import CreateStepWrap from 'dashboard/routes/dashboard/settings/teams/Create/Index.vue';
import CreateTeam from 'dashboard/routes/dashboard/settings/teams/Create/CreateTeam.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaTeamsNew',
  components: { Head, CreateStepWrap, CreateTeam },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="New Team" />
  <CreateStepWrap>
    <CreateTeam />
  </CreateStepWrap>
</template>
