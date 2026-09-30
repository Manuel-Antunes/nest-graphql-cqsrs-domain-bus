<script>
// Inbox setup wizard — step 1 (thin-shell). InboxChannels renders the woot-wizard step
// sidebar (active step read via useAppNavigation().currentRouteName) and the ChannelList
// as its slot. ChannelList navigates to the channel page via useAppNavigation().visit.
import { Head } from '@inertiajs/vue3';
import InboxChannels from 'dashboard/routes/dashboard/settings/inbox/InboxChannels.vue';
import ChannelList from 'dashboard/routes/dashboard/settings/inbox/ChannelList.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaInboxChannelList',
  components: { Head, InboxChannels, ChannelList },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="New Inbox" />
  <InboxChannels>
    <ChannelList />
  </InboxChannels>
</template>
