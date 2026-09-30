<script>
// Team create wizard — step 3 (thin-shell). CreateStepWrap renders the step sidebar
// and the FinishSetup component as its slot. FinishSetup's "done" button is an
// AppLink that Inertia-visits back to the teams list.
import { Head } from '@inertiajs/vue3';
import CreateStepWrap from 'dashboard/routes/dashboard/settings/teams/Create/Index.vue';
import FinishSetup from 'dashboard/routes/dashboard/settings/teams/FinishSetup.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaTeamsFinish',
  components: { Head, CreateStepWrap, FinishSetup },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Team Setup" />
  <CreateStepWrap>
    <FinishSetup />
  </CreateStepWrap>
</template>
