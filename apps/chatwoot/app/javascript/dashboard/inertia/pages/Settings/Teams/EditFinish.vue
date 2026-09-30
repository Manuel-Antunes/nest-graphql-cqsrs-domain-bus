<script>
// Team edit wizard — step 3 (thin-shell). EditStepWrap renders the step sidebar and
// the FinishSetup component as its slot. FinishSetup's "done" button is an AppLink
// that Inertia-visits back to the teams list.
import { Head } from '@inertiajs/vue3';
import EditStepWrap from 'dashboard/routes/dashboard/settings/teams/Edit/Index.vue';
import FinishSetup from 'dashboard/routes/dashboard/settings/teams/FinishSetup.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaTeamsEditFinish',
  components: { Head, EditStepWrap, FinishSetup },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Team Setup" />
  <EditStepWrap>
    <FinishSetup />
  </EditStepWrap>
</template>
