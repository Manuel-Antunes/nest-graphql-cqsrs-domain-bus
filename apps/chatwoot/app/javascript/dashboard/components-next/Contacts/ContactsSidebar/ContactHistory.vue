<script setup>
import { computed } from 'vue';
import { useMapGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useI18n } from 'vue-i18n';

import { Spinner } from 'dashboard/components-next/ui/spinner';
import ConversationCard from 'dashboard/components-next/Conversation/ConversationCard/ConversationCard.vue';

const { t } = useI18n();
const { currentParams } = useAppNavigation();

const conversations = useMapGetter(
  'contactConversations/getAllConversationsByContactId'
);
const contactsById = useMapGetter('contacts/getContactById');
const stateInbox = useMapGetter('inboxes/getInboxById');
const accountLabels = useMapGetter('labels/getLabels');

const accountLabelsValue = computed(() => accountLabels.value);

const uiFlags = useMapGetter('contactConversations/getUIFlags');
const isFetching = computed(() => uiFlags.value.isFetching);

const contactConversations = computed(() =>
  conversations.value(currentParams.value.contactId)
);
</script>

<template>
  <div
    v-if="isFetching"
    class="flex items-center justify-center py-10 text-muted-foreground"
  >
    <Spinner class="size-6" />
  </div>
  <div
    v-else-if="contactConversations.length > 0"
    class="px-6 py-4 divide-y divide-n-strong [&>*:hover]:!border-y-transparent [&>*:hover+*]:!border-t-transparent"
  >
    <ConversationCard
      v-for="conversation in contactConversations"
      :key="conversation.id"
      :conversation="conversation"
      :contact="contactsById(conversation.meta.sender.id)"
      :state-inbox="stateInbox(conversation.inboxId)"
      :account-labels="accountLabelsValue"
    />
  </div>
  <p
    v-else
    class="px-6 py-10 text-sm leading-6 text-center text-muted-foreground"
  >
    {{ t('CONTACTS_LAYOUT.SIDEBAR.HISTORY.EMPTY_STATE') }}
  </p>
</template>
