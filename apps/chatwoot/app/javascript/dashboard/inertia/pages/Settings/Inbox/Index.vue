<script>
// Inbox (channels) list (thin-shell). Its "New inbox" button + row "Settings" links
// are AppLinks that Inertia-visit the wizard / settings pages below. No data props —
// the persistent AppShell sidebar dispatches inboxes/get, unchanged from the SPA.
import { Head } from '@inertiajs/vue3';
import InboxHome from 'dashboard/routes/dashboard/settings/inbox/Index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaInboxIndex',
  components: { Head, InboxHome },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Inboxes" />
  <InboxHome />
</template>
