<script>
// Teams list (thin-shell). Its "New team" button + row "Edit" links are AppLinks
// that Inertia-visit the wizard pages below. No data props — unchanged from the SPA.
import { Head } from '@inertiajs/vue3';
import TeamsIndex from 'dashboard/routes/dashboard/settings/teams/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaTeamsIndex',
  components: { Head, TeamsIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Teams" />
  <TeamsIndex />
</template>
