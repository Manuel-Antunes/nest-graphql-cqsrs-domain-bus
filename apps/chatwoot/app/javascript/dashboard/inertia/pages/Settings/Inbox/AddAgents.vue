<script>
// Inbox setup wizard — step 3 (thin-shell). InboxChannels renders the step sidebar and
// the AddAgents component as its slot. AddAgents reads the inbox id from the URL via
// useAppNavigation().currentParams and navigates to the finish step via visit.
import { Head } from '@inertiajs/vue3';
import InboxChannels from 'dashboard/routes/dashboard/settings/inbox/InboxChannels.vue';
import AddAgents from 'dashboard/routes/dashboard/settings/inbox/AddAgents.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaInboxAddAgents',
  components: { Head, InboxChannels, AddAgents },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Add Agents" />
  <InboxChannels>
    <AddAgents />
  </InboxChannels>
</template>
