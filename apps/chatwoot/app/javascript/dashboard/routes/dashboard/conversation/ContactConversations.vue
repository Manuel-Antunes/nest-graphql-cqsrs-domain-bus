<script setup>
import { computed, onMounted, watch } from 'vue';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useConversationRoutePath } from 'dashboard/composables/useConversationRoutePath';
import ConversationCard from 'dashboard/components/widgets/conversation/ConversationCard.vue';
import ConversationContextMenu from 'dashboard/components/widgets/conversation/contextMenu/Index.vue';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
} from 'dashboard/components-next/ui/context-menu';
import { Spinner } from 'dashboard/components-next/ui/spinner';

const props = defineProps({
  contactId: { type: [String, Number], required: true },
  conversationId: { type: [String, Number], required: true },
});

const store = useStore();
const { visit } = useAppNavigation();
const { buildConversationPath } = useConversationRoutePath();

const currentChat = useMapGetter('getSelectedChat');
const uiFlags = useMapGetter('contactConversations/getUIFlags');

const contactGetter = useMapGetter('contacts/getContact');
const inboxGetter = useMapGetter('inboxes/getInbox');

const activeInbox = useMapGetter('getSelectedInbox');
const inboxesList = useMapGetter('inboxes/getInboxes');
const showInboxName = computed(
  () => !activeInbox.value && inboxesList.value.length > 1
);

const contactConversationGetter = useMapGetter(
  'contactConversations/getContactConversation'
);
const conversations = computed(() =>
  contactConversationGetter.value(props.contactId)
);

const previousConversations = computed(() =>
  conversations.value.filter(c => c.id !== Number(props.conversationId))
);

const onCardClick = (conversation, e) => {
  const path = buildConversationPath(conversation.id);
  if (!path) return;

  if (e.metaKey || e.ctrlKey) {
    e.preventDefault();
    window.open(
      `${window.chatwootConfig.hostURL}${path}`,
      '_blank',
      'noopener,noreferrer'
    );
    return;
  }

  visit(path);
};

watch(
  () => props.contactId,
  (newId, oldId) => {
    if (newId && newId !== oldId) {
      store.dispatch('contactConversations/get', newId);
    }
  }
);

onMounted(() => {
  store.dispatch('contactConversations/get', props.contactId);
});
</script>

<template>
  <div v-if="!uiFlags.isFetching" class="">
    <div v-if="!previousConversations.length" class="flex justify-center">
      <span class="p-4 text-sm leading-6 text-center text-muted-foreground">
        {{ $t('CONTACT_PANEL.CONVERSATIONS.NO_RECORDS_FOUND') }}
      </span>
    </div>
    <div
      v-else
      class="contact-conversation--list [&>.conversation:last-child]:!border-b-0 [&>.conversation:last-child:hover]:!border-b-0 [&>.conversation:last-child]:!rounded-b-lg"
    >
      <ContextMenu
        v-for="conversation in previousConversations"
        :key="conversation.id"
      >
        <ContextMenuTrigger as-child>
          <ConversationCard
            :chat="conversation"
            :current-contact="
              contactGetter(conversation.meta?.sender?.id) || {}
            "
            :assignee="conversation.meta?.assignee || {}"
            :inbox="inboxGetter(conversation.inbox_id) || {}"
            :is-active-chat="currentChat.id === conversation.id"
            :show-inbox-name="showInboxName"
            hide-thumbnail
            compact
            @click="onCardClick(conversation, $event)"
          />
        </ContextMenuTrigger>
        <ContextMenuContent class="w-56">
          <ConversationContextMenu
            :status="conversation.status"
            :inbox-id="conversation.inbox_id"
            :priority="conversation.priority"
            :chat-id="conversation.id"
            :has-unread-messages="conversation.unread_count > 0"
            :conversation-labels="conversation.labels"
            :conversation-url="buildConversationPath(conversation.id)"
            :allowed-options="['open-new-tab', 'copy-link']"
          />
        </ContextMenuContent>
      </ContextMenu>
    </div>
  </div>
  <div v-else class="flex items-center justify-center py-5">
    <Spinner class="size-6" />
  </div>
</template>
