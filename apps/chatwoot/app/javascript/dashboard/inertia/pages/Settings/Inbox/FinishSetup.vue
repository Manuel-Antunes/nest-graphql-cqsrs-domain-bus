<script>
// Inbox setup wizard — step 4 (thin-shell). InboxChannels renders the step sidebar and
// the FinishSetup component as its slot. FinishSetup reads the inbox id from the URL via
// useAppNavigation().currentParams; its "more settings" / "take me there" buttons are
// AppLinks that Inertia-visit the inbox settings page / hard-navigate the conversation view.
import { Head } from '@inertiajs/vue3';
import InboxChannels from 'dashboard/routes/dashboard/settings/inbox/InboxChannels.vue';
import FinishSetup from 'dashboard/routes/dashboard/settings/inbox/FinishSetup.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaInboxFinishSetup',
  components: { Head, InboxChannels, FinishSetup },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Inbox Setup" />
  <InboxChannels>
    <FinishSetup />
  </InboxChannels>
</template>
