<script>
import { Head } from '@inertiajs/vue3';
import ConversationWorkflowIndex from 'dashboard/routes/dashboard/settings/conversationWorkflow/index.vue';
import AppShell from 'dashboard/inertia/layouts/AppShell.vue';
import SettingsLayout from 'dashboard/inertia/layouts/SettingsLayout.vue';
import SettingsWrapper from 'dashboard/inertia/layouts/SettingsWrapper.vue';

export default {
  name: 'InertiaConversationWorkflowIndex',
  components: { Head, ConversationWorkflowIndex },
  layout: [AppShell, SettingsLayout, SettingsWrapper],
};
</script>

<template>
  <Head title="Conversation Workflow" />
  <ConversationWorkflowIndex />
</template>
