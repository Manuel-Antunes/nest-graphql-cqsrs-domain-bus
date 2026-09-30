<script>
// inbox-view empty state. InboxList now lives in the persistent InboxViewLayout so it
// doesn't refetch on navigation; this page only supplies the detail-pane content (the
// empty state) which renders into InboxList's slot.
import { Head } from '@inertiajs/vue3';
import InboxEmptyStateView from 'dashboard/routes/dashboard/inbox/InboxEmptyState.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import InboxViewLayout from 'dashboard/inertia/layouts/InboxViewLayout.vue';

export default {
  name: 'InertiaInboxView',
  components: { Head, InboxEmptyStateView },
  layout: [AppShell, InboxViewLayout],
};
</script>

<template>
  <Head title="Inbox" />
  <InboxEmptyStateView />
</template>
