<script setup>
import { computed, reactive, watch, onMounted, onBeforeUnmount } from 'vue';
import { fromUnixTime, isSameDay } from 'date-fns';
import Message from './Message.vue';
import DateSeparator from './DateSeparator.vue';
import { MESSAGE_TYPES } from './constants.js';
import { useCamelCase } from 'dashboard/composables/useTransformKeys';
import { useMapGetter } from 'dashboard/composables/store.js';
import MessageApi from 'dashboard/api/inbox/message.js';
import {
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
  useMessageScrollerScrollable,
} from 'next/ui/message-scroller';
import { emitter } from 'shared/helpers/mitt';
import { BUS_EVENTS } from 'shared/constants/busEvents';

/**
 * Props definition for the component
 * @typedef {Object} Props
 * @property {Array} readMessages - Array of read messages
 * @property {Array} unReadMessages - Array of unread messages
 * @property {Number} currentUserId - ID of the current user
 * @property {Boolean} isAnEmailChannel - Whether this is an email channel
 * @property {Object} inboxSupportsReplyTo - Inbox reply support configuration
 * @property {Array} messages - Array of all messages [These are not in camelcase]
 */
const props = defineProps({
  currentUserId: {
    type: Number,
    required: true,
  },
  firstUnreadId: {
    type: Number,
    default: null,
  },
  isAnEmailChannel: {
    type: Boolean,
    default: false,
  },
  inboxSupportsReplyTo: {
    type: Object,
    default: () => ({ incoming: false, outgoing: false }),
  },
  messages: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['retry', 'loadOlder']);

const allMessages = computed(() => {
  return useCamelCase(props.messages, {
    deep: true,
    stopPaths: ['content_attributes.translations'],
  });
});

const currentChat = useMapGetter('getSelectedChat');

// Cache for fetched reply messages to avoid duplicate API calls
const fetchedReplyMessages = reactive(new Map());

/**
 * Fetches a specific message from the API by trying to get messages around it
 * @param {number} messageId - The ID of the message to fetch
 * @param {number} conversationId - The ID of the conversation
 * @returns {Promise<Object|null>} - The fetched message or null if not found/error
 */
const fetchReplyMessage = async (messageId, conversationId) => {
  // Return cached result if already fetched
  if (fetchedReplyMessages.has(messageId)) {
    return fetchedReplyMessages.get(messageId);
  }

  try {
    const response = await MessageApi.getPreviousMessages({
      conversationId,
      before: messageId + 100,
      after: messageId - 100,
    });

    const messages = response.data?.payload || [];
    const targetMessage = messages.find(msg => msg.id === messageId);

    if (targetMessage) {
      const camelCaseMessage = useCamelCase(targetMessage);
      fetchedReplyMessages.set(messageId, camelCaseMessage);
      return camelCaseMessage;
    }

    // Cache null result to avoid repeated API calls
    fetchedReplyMessages.set(messageId, null);
    return null;
  } catch (error) {
    fetchedReplyMessages.set(messageId, null);
    return null;
  }
};

/**
 * Determines if a message should be grouped with the next message
 * @param {Number} index - Index of the current message
 * @param {Array} searchList - Array of messages to check
 * @returns {Boolean} - Whether the message should be grouped with next
 */
const shouldGroupWithNext = (index, searchList) => {
  if (index === searchList.length - 1) return false;

  const current = searchList[index];
  const next = searchList[index + 1];

  if (next.status === 'failed') return false;

  const nextSenderId = next.senderId ?? next.sender?.id;
  const currentSenderId = current.senderId ?? current.sender?.id;
  const hasSameSender = nextSenderId === currentSenderId;

  const nextMessageType = next.messageType;
  const currentMessageType = current.messageType;

  const areBothTemplates =
    nextMessageType === MESSAGE_TYPES.TEMPLATE &&
    currentMessageType === MESSAGE_TYPES.TEMPLATE;

  if (!hasSameSender || areBothTemplates) return false;

  if (currentMessageType !== nextMessageType) return false;

  // Check if messages are in the same minute by rounding down to nearest minute
  return Math.floor(next.createdAt / 60) === Math.floor(current.createdAt / 60);
};

/**
 * Determines if a day separator should be shown before the message at `index`.
 * Shown before the first message and whenever the day changes from the previous message.
 * @param {Number} index - Index of the current message
 * @param {Array} searchList - Array of messages to check
 * @returns {Boolean} - Whether a date separator should be rendered before this message
 */
const shouldShowDateSeparator = (index, searchList) => {
  const current = searchList[index];
  if (!current?.createdAt) return false;
  if (index === 0) return true;

  const previous = searchList[index - 1];
  if (!previous?.createdAt) return true;

  return !isSameDay(
    fromUnixTime(current.createdAt),
    fromUnixTime(previous.createdAt)
  );
};

/**
 * Gets the message that was replied to
 * @param {Object} parentMessage - The message containing the reply reference
 * @returns {Object|null} - The message being replied to, or null if not found
 */
const getInReplyToMessage = parentMessage => {
  if (!parentMessage) return null;

  const inReplyToMessageId =
    parentMessage.contentAttributes?.inReplyTo ??
    parentMessage.content_attributes?.in_reply_to;

  if (!inReplyToMessageId) return null;

  // Try to find in current messages first
  let replyMessage = props.messages?.find(msg => msg.id === inReplyToMessageId);

  // Then try store messages
  if (!replyMessage && currentChat.value?.messages) {
    replyMessage = currentChat.value.messages.find(
      msg => msg.id === inReplyToMessageId
    );
  }

  // Then check fetch cache
  if (!replyMessage && fetchedReplyMessages.has(inReplyToMessageId)) {
    replyMessage = fetchedReplyMessages.get(inReplyToMessageId);
  }

  // If still not found and we have conversation context, fetch it
  if (!replyMessage && currentChat.value?.id) {
    fetchReplyMessage(inReplyToMessageId, currentChat.value.id);
    return null; // Let UI handle loading state
  }

  return replyMessage ? useCamelCase(replyMessage) : null;
};

// ── MessageScroller wiring (the provider lives in MessagesView) ────────────
// Injects the scroller context; MessageList is always rendered inside a
// MessageScrollerProvider (see MessagesView.vue).
const { scrollToMessage } = useMessageScroller();
const scrollable = useMessageScrollerScrollable();

// Reaching the top edge loads the previous page. The scroller keeps the reading
// position via prepend-anchoring, so there is no manual scrollTop math here.
watch(
  () => scrollable.value.start,
  atStart => {
    if (atStart) emit('loadOlder');
  }
);

// Reply / permalink jumps. scrollToMessage queues the jump if the target item
// mounts a frame later, so a plain call is enough for in-list messages.
const onScrollToMessage = ({ messageId = '' } = {}) => {
  if (messageId === '' || messageId === null || messageId === undefined) return;
  scrollToMessage(String(messageId));
};
onMounted(() => emitter.on(BUS_EVENTS.SCROLL_TO_MESSAGE, onScrollToMessage));
onBeforeUnmount(() =>
  emitter.off(BUS_EVENTS.SCROLL_TO_MESSAGE, onScrollToMessage)
);
</script>

<template>
  <MessageScroller class="size-full">
    <MessageScrollerViewport
      class="conversation-panel bg-n-background"
      aria-label="Messages"
    >
      <MessageScrollerContent class="gap-0 px-4 pb-4">
        <slot name="beforeAll" />
        <template v-for="(message, index) in allMessages" :key="message.id">
          <DateSeparator
            v-if="shouldShowDateSeparator(index, allMessages)"
            :date="message.createdAt"
          />
          <slot
            v-if="firstUnreadId && message.id === firstUnreadId"
            name="unreadBadge"
          />
          <MessageScrollerItem :message-id="String(message.id)">
            <Message
              v-bind="message"
              :is-email-inbox="isAnEmailChannel"
              :in-reply-to="getInReplyToMessage(message)"
              :group-with-next="shouldGroupWithNext(index, allMessages)"
              :inbox-supports-reply-to="inboxSupportsReplyTo"
              :current-user-id="currentUserId"
              data-clarity-mask="True"
              @retry="emit('retry', message)"
            />
          </MessageScrollerItem>
        </template>
        <slot name="after" />
      </MessageScrollerContent>
    </MessageScrollerViewport>
    <MessageScrollerButton direction="end" class="z-10" />
  </MessageScroller>
</template>
