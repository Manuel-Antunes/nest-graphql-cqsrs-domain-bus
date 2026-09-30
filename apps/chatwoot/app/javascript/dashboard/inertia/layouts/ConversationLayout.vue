<script setup>
// Persistent layout for the conversation/inbox view. Because it's a LAYOUT (not the
// page), Inertia keeps it mounted while navigating between conversations — so ChatList
// (the conversation list) does NOT re-mount/refetch on every conversation click.
// ConversationView's params are derived reactively from the URL (not page props), so a
// conversation-to-conversation visit just updates the props in place without a remount.
import { computed } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import ConversationView from 'dashboard/routes/dashboard/conversation/ConversationView.vue';

const { currentParams, currentRouteName } = useAppNavigation();

const inboxId = computed(() => {
  const id = currentParams.value.inbox_id;
  return id != null ? Number(id) : 0;
});
const conversationId = computed(
  () => currentParams.value.conversation_id ?? currentParams.value.conversationId ?? 0
);
const label = computed(() => currentParams.value.label ?? '');
const teamId = computed(() => currentParams.value.teamId ?? '');
const foldersId = computed(() => currentParams.value.id ?? 0);
const conversationType = computed(() => {
  const name = currentRouteName.value || '';
  if (name.includes('mention')) return 'mention';
  if (name.includes('unattended')) return 'unattended';
  if (name.includes('participating')) return 'participating';
  return '';
});
</script>

<template>
  <ConversationView
    :inbox-id="inboxId"
    :conversation-id="conversationId"
    :label="label"
    :team-id="teamId"
    :conversation-type="conversationType"
    :folders-id="foldersId"
  />
  <slot />
</template>
