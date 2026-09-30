<script>
// Per-inbox settings page (thin-shell). InboxSettings reads the inbox id + active tab
// from the URL via useAppNavigation().currentParams, and updates the tab in place via
// window.history.replaceState. No data props — it fetches inbox/agents/teams/labels via
// the existing Vuex path, unchanged from the SPA.
import { Head } from '@inertiajs/vue3';
import InboxSettings from 'dashboard/routes/dashboard/settings/inbox/Settings.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaInboxShow',
  components: { Head, InboxSettings },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Inbox Settings" />
  <InboxSettings />
</template>
