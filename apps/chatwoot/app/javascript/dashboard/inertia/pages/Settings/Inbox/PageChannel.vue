<script>
// Inbox setup wizard — step 2, per-channel form (thin-shell). InboxChannels renders the
// step sidebar and ChannelFactory as its slot. ChannelFactory picks the channel form
// from the channelName, which the SPA route supplied via `props: route =>
// ({ channelName: route.params.sub_page })`. Under Inertia we read the same sub_page
// from the URL via useAppNavigation().currentParams.
import { computed } from 'vue';
import { Head } from '@inertiajs/vue3';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import InboxChannels from 'dashboard/routes/dashboard/settings/inbox/InboxChannels.vue';
import ChannelFactory from 'dashboard/routes/dashboard/settings/inbox/ChannelFactory.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaInboxPageChannel',
  components: { Head, InboxChannels, ChannelFactory },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
  setup() {
    const { currentParams } = useAppNavigation();
    const channelName = computed(() => currentParams.value.sub_page);
    return { channelName };
  },
};
</script>

<template>
  <Head title="New Inbox" />
  <InboxChannels>
    <ChannelFactory v-if="channelName" :channel-name="channelName" />
  </InboxChannels>
</template>
