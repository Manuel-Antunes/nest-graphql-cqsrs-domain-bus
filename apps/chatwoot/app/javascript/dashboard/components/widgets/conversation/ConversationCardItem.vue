<script setup>
import { computed, ref, inject } from 'vue';
import { useAppNavigation } from 'dashboard/composables/useAppNavigation';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { getLastMessage } from 'dashboard/helper/conversationHelper';
import { frontendURL, conversationUrl } from 'dashboard/helper/URLHelper';
import Avatar from 'next/avatar/Avatar.vue';
import MessagePreview from './MessagePreview.vue';
import InboxName from '../InboxName.vue';
import ConversationContextMenu from './contextMenu/Index.vue';
import TimeAgo from 'dashboard/components/ui/TimeAgo.vue';
import CardLabels from './conversationCardComponents/CardLabels.vue';
import PriorityMark from './PriorityMark.vue';
import SLACardLabel from './components/SLACardLabel.vue';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
} from 'dashboard/components-next/ui/context-menu';
import { Checkbox } from 'dashboard/components-next/ui/checkbox';
import VoiceCallStatus from './VoiceCallStatus.vue';
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemHeader,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from 'dashboard/components-next/ui/item';

// Inbox-list-only card built on the shadcn `Item` primitive. Self-contained:
// it injects the handlers ChatList provides (same set ConversationItem uses),
// so it can be rendered directly inside the list without the wrapper.
const props = defineProps({
  source: { type: Object, required: true },
  activeLabel: { type: String, default: '' },
  teamId: { type: [String, Number], default: 0 },
  foldersId: { type: [String, Number], default: 0 },
  conversationType: { type: String, default: '' },
  showAssignee: { type: Boolean, default: false },
  hideInboxName: { type: Boolean, default: false },
  hideThumbnail: { type: Boolean, default: false },
  allowedContextMenuOptions: { type: Array, default: () => [] },
});

const selectConversation = inject('selectConversation');
const deSelectConversation = inject('deSelectConversation');
const assignAgent = inject('assignAgent');
const assignTeam = inject('assignTeam');
const assignLabels = inject('assignLabels');
const updateConversationStatus = inject('updateConversationStatus');
const toggleContextMenu = inject('toggleContextMenu');
const markAsUnreadFn = inject('markAsUnread');
const markAsReadFn = inject('markAsRead');
const assignPriorityFn = inject('assignPriority');
const isConversationSelected = inject('isConversationSelected');
const deleteConversationFn = inject('deleteConversation');

const { visit } = useAppNavigation();
const store = useStore();

const chat = computed(() => props.source);

const hovered = ref(false);

const currentChat = useMapGetter('getSelectedChat');
const inboxesList = useMapGetter('inboxes/getInboxes');
const activeInbox = useMapGetter('getSelectedInbox');
const accountId = useMapGetter('getCurrentAccountId');

const selected = computed(() => isConversationSelected(chat.value.id));

const chatMetadata = computed(() => chat.value.meta || {});
const assignee = computed(() => chatMetadata.value.assignee || {});
const senderId = computed(() => chatMetadata.value.sender?.id);
const currentContact = computed(() =>
  senderId.value ? store.getters['contacts/getContact'](senderId.value) : {}
);
const isActiveChat = computed(() => currentChat.value.id === chat.value.id);
const unreadCount = computed(() => chat.value.unread_count);
const hasUnread = computed(() => unreadCount.value > 0);
const isInboxNameVisible = computed(() => !activeInbox.value);
const lastMessageInChat = computed(() => getLastMessage(chat.value));
const voiceCallData = computed(() => ({
  status: chat.value.additional_attributes?.call_status,
  direction: chat.value.additional_attributes?.call_direction,
}));
const inboxId = computed(() => chat.value.inbox_id);
const inbox = computed(() =>
  inboxId.value ? store.getters['inboxes/getInbox'](inboxId.value) : {}
);
const showInboxName = computed(
  () =>
    !props.hideInboxName &&
    isInboxNameVisible.value &&
    inboxesList.value.length > 1
);
const showMetaSection = computed(
  () =>
    showInboxName.value ||
    (props.showAssignee && assignee.value.name) ||
    chat.value.priority
);
const hasSlaPolicyId = computed(() => chat.value?.sla_policy_id);
const showLabelsSection = computed(
  () => chat.value.labels?.length > 0 || hasSlaPolicyId.value
);
const messagePreviewClass = computed(() =>
  hasUnread.value ? 'font-medium text-foreground' : 'text-muted-foreground'
);
const conversationPath = computed(() =>
  frontendURL(
    conversationUrl({
      accountId: accountId.value,
      activeInbox: activeInbox.value,
      id: chat.value.id,
      label: props.activeLabel,
      teamId: props.teamId,
      conversationType: props.conversationType,
      foldersId: props.foldersId,
    })
  )
);

const onCardClick = e => {
  const path = conversationPath.value;
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
  if (isActiveChat.value) return;
  visit(path);
};

const onThumbnailHover = () => {
  hovered.value = !props.hideThumbnail;
};
const onThumbnailLeave = () => {
  hovered.value = false;
};

const onSelectConversation = checked => {
  if (checked) {
    selectConversation(chat.value.id, inbox.value.id);
  } else {
    deSelectConversation(chat.value.id, inbox.value.id);
  }
};

const onContextMenuOpenChange = isOpen => {
  toggleContextMenu(isOpen);
};
const onUpdateConversation = (status, snoozedUntil) => {
  updateConversationStatus(chat.value.id, status, snoozedUntil);
};
const onAssignAgent = agent => {
  assignAgent(agent, [chat.value.id]);
};
const onAssignLabel = label => {
  assignLabels([label.title], [chat.value.id]);
};
const onAssignTeam = team => {
  assignTeam(team, chat.value.id);
};
const onMarkAsUnread = () => {
  markAsUnreadFn(chat.value.id);
};
const onMarkAsRead = () => {
  markAsReadFn(chat.value.id);
};
const onAssignPriority = priority => {
  assignPriorityFn(priority, chat.value.id);
};
const onDeleteConversation = () => {
  deleteConversationFn(chat.value.id);
};
</script>

<template>
  <ContextMenu @update:open="onContextMenuOpenChange">
    <ContextMenuTrigger as-child>
      <Item
        class="cursor-pointer items-start"
        :class="
          isActiveChat
            ? 'bg-accent'
            : selected
              ? 'bg-muted'
              : 'hover:bg-accent/50'
        "
        @click="onCardClick"
      >
        <ItemMedia
          v-if="!hideThumbnail"
          @mouseenter="onThumbnailHover"
          @mouseleave="onThumbnailLeave"
        >
          <Avatar
            :name="currentContact.name"
            :src="currentContact.thumbnail"
            :size="32"
            :status="currentContact.availability_status"
            hide-offline-status
            rounded-full
          >
            <template #overlay="{ size }">
              <label
                v-if="hovered || selected"
                class="absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-full backdrop-blur-[2px]"
                :style="{ width: `${size}px`, height: `${size}px` }"
                @click.stop
              >
                <Checkbox
                  :checked="selected"
                  class="cursor-pointer data-[state=unchecked]:bg-n-background dark:data-[state=unchecked]:bg-n-background"
                  @update:checked="onSelectConversation"
                />
              </label>
            </template>
          </Avatar>
        </ItemMedia>

        <ItemContent class="min-w-0">
          <ItemHeader v-if="showMetaSection">
            <InboxName
              v-if="showInboxName"
              :inbox="inbox"
              class="min-w-0 flex-1"
            />
            <PriorityMark :priority="chat.priority" />
          </ItemHeader>

          <ItemTitle :class="hasUnread && 'font-semibold'">
            <span class="truncate capitalize">{{ currentContact.name }}</span>
          </ItemTitle>

          <VoiceCallStatus
            v-if="voiceCallData.status"
            :status="voiceCallData.status"
            :direction="voiceCallData.direction"
            :message-preview-class="messagePreviewClass"
          />
          <MessagePreview
            v-else-if="lastMessageInChat"
            :message="lastMessageInChat"
            :class="messagePreviewClass"
          />
          <ItemDescription v-else class="line-clamp-1">
            <fluent-icon icon="info" size="16" class="align-middle" />
            {{ $t(`CHAT_LIST.NO_MESSAGES`) }}
          </ItemDescription>

          <CardLabels
            v-if="showLabelsSection"
            :conversation-labels="chat.labels"
          >
            <template v-if="hasSlaPolicyId" #before>
              <SLACardLabel :chat="chat" />
            </template>
          </CardLabels>
        </ItemContent>

        <ItemActions class="flex-col items-end self-start">
          <TimeAgo
            class="text-xxs text-muted-foreground"
            :last-activity-timestamp="chat.timestamp"
            :created-at-timestamp="chat.created_at"
          />
          <span
            v-if="hasUnread"
            class="rounded-full min-w-5 max-w-5 bg-primary px-1.5 text-xxs font-semibold text-primary-foreground"
          >
            {{ unreadCount > 9 ? '9+' : unreadCount }}
          </span>
          <span
            v-if="showAssignee && assignee.name"
            class="inline-flex items-center gap-1 truncate text-xs"
          >
            <fluent-icon icon="person" size="12" />
            {{ assignee.name }}
          </span>
        </ItemActions>
      </Item>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-56">
      <ConversationContextMenu
        :status="chat.status"
        :inbox-id="inbox.id"
        :priority="chat.priority"
        :chat-id="chat.id"
        :has-unread-messages="hasUnread"
        :conversation-url="conversationPath"
        :allowed-options="allowedContextMenuOptions"
        @update-conversation="onUpdateConversation"
        @assign-agent="onAssignAgent"
        @assign-label="onAssignLabel"
        @assign-team="onAssignTeam"
        @mark-as-unread="onMarkAsUnread"
        @mark-as-read="onMarkAsRead"
        @assign-priority="onAssignPriority"
        @delete-conversation="onDeleteConversation"
      />
    </ContextMenuContent>
  </ContextMenu>
</template>
