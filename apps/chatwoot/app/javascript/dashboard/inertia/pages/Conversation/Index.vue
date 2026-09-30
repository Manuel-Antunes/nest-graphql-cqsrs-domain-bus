<script>
// Conversation / inbox view under Inertia. ConversationView (and its ChatList) now live
// in the PERSISTENT ConversationLayout so navigating between conversations does NOT
// remount them (the list no longer refetches on every conversation click). This page is
// therefore an empty routing shell — the layout stack renders everything and derives the
// route params reactively from the URL. AppShell bootstraps the store + ActionCable.
import { Head } from '@inertiajs/vue3';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import ConversationLayout from 'dashboard/inertia/layouts/ConversationLayout.vue';

export default {
  name: 'InertiaConversationView',
  components: { Head },
  // Both layouts persist across conversation-to-conversation visits, so ConversationView
  // stays mounted and only its props change.
  layout: [AppShell, ConversationLayout],
};
</script>

<template>
  <Head title="Conversations" />
</template>
