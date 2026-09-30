<script>
// inbox-view detail. InboxList lives in the persistent InboxViewLayout (no refetch on
// navigation); this page supplies only the detail pane, which renders into InboxList's
// slot. InboxDetailView reads its type/id from the URL via useAppNavigation().currentParams
// (route path /inbox-view/:type/:id), so switching items updates it without a remount.
import { Head } from '@inertiajs/vue3';
import InboxDetailView from 'dashboard/routes/dashboard/inbox/InboxView.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import InboxViewLayout from 'dashboard/inertia/layouts/InboxViewLayout.vue';

export default {
  name: 'InertiaInboxViewConversation',
  components: { Head, InboxDetailView },
  layout: [AppShell, InboxViewLayout],
};
</script>

<template>
  <Head title="Inbox" />
  <InboxDetailView />
</template>
