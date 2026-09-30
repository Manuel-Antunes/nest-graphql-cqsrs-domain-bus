<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';

import ConversationCard from 'dashboard/components-next/Conversation/ConversationCard/ConversationCard.vue';
import { Spinner } from 'dashboard/components-next/ui/spinner';

defineProps({
  conversations: {
    type: Array,
    default: () => [],
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const { t } = useI18n();
const contactsById = useMapGetter('contacts/getContactById');
const stateInbox = useMapGetter('inboxes/getInboxById');
const accountLabels = useMapGetter('labels/getLabels');

const accountLabelsValue = computed(() => accountLabels.value);
const conversationContact = conversation => {
  const sender = conversation.meta?.sender || {};
  const contact = contactsById.value(sender.id);
  return contact.id ? contact : sender;
};
const conversationInbox = conversation =>
  stateInbox.value(conversation.inboxId) || {
    name: '',
    channelType: conversation.meta?.channel,
  };
</script>

<template>
  <div
    v-if="isLoading"
    class="flex items-center justify-center py-10 text-muted-foreground"
  >
    <Spinner class="size-6" />
  </div>

  <div
    v-else-if="conversations.length > 0"
    class="px-6 divide-y divide-n-strong [&>*:hover]:!border-y-transparent [&>*:hover+*]:!border-t-transparent"
  >
    <ConversationCard
      v-for="conversation in conversations"
      :key="conversation.id"
      :conversation="conversation"
      :contact="conversationContact(conversation)"
      :state-inbox="conversationInbox(conversation)"
      :account-labels="accountLabelsValue"
    />
  </div>

  <p
    v-else
    class="py-8 px-4 mx-6 text-sm text-center rounded-xl border border-dashed border-n-strong text-n-slate-11"
  >
    {{ t('COMPANIES.DETAIL.HISTORY.EMPTY') }}
  </p>
</template>
