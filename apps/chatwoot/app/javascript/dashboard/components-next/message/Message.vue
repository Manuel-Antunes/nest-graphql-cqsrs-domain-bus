<script setup>
import { onMounted, computed, ref, toRefs } from 'vue';
import { useTimeoutFn } from '@vueuse/core';
import { provideMessageContext } from './provider.js';
import { useTrack } from 'dashboard/composables';
import { emitter } from 'shared/helpers/mitt';
import { useI18n } from 'vue-i18n';
import { LocalStorage } from 'shared/helpers/localStorage';
import { ACCOUNT_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
import { LOCAL_STORAGE_KEYS } from 'dashboard/constants/localStorage';
import { getInboxIconByType } from 'dashboard/helper/inbox';
import { BUS_EVENTS } from 'shared/constants/busEvents';
import {
  MESSAGE_TYPES,
  ATTACHMENT_TYPES,
  MESSAGE_VARIANTS,
  SENDER_TYPES,
  ORIENTATION,
  MESSAGE_STATUS,
  CONTENT_TYPES,
} from './constants';

import { Avatar, AvatarImage, AvatarFallback } from 'next/ui/avatar';
import { Marker, MarkerContent } from 'next/ui/marker';
import {
  Message as MessageRoot,
  MessageAvatar,
  MessageContent,
  MessageFooter,
} from 'next/ui/message';
import MessageMeta from './MessageMeta.vue';
import { messageTimestamp } from 'shared/helpers/timeHelper';

import TextBubble from './bubbles/Text/Index.vue';
import ImageBubble from './bubbles/Image.vue';
import FileBubble from './bubbles/File.vue';
import AudioBubble from './bubbles/Audio.vue';
import VideoBubble from './bubbles/Video.vue';
import EmbedBubble from './bubbles/Embed.vue';
import FallbackBubble from './bubbles/Fallback.vue';
import InstagramStoryBubble from './bubbles/InstagramStory.vue';
import EmailBubble from './bubbles/Email/Index.vue';
import UnsupportedBubble from './bubbles/Unsupported.vue';
import ContactBubble from './bubbles/Contact.vue';
import DyteBubble from './bubbles/Dyte.vue';
import LocationBubble from './bubbles/Location.vue';
import CSATBubble from './bubbles/CSAT.vue';
import FormBubble from './bubbles/Form.vue';
import VoiceCallBubble from './bubbles/VoiceCall.vue';
import WhatsappFlowResponseBubble from './bubbles/WhatsappFlowResponse.vue';
import WhatsappReferral from './bubbles/Text/WhatsappReferral.vue';

import MessageError from './MessageError.vue';
import CaptainGenerationDetails from './CaptainGenerationDetails.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from 'dashboard/components-next/ui/context-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from 'next/ui/alert-dialog';
import AddCannedModal from 'dashboard/routes/dashboard/settings/canned/AddCanned.vue';
import ReportCaptainMessageDialog from 'dashboard/modules/conversations/components/ReportCaptainMessageDialog.vue';
import { useStore, useMapGetter } from 'dashboard/composables/store';
import { useAlert } from 'dashboard/composables';
import { useMessageFormatter } from 'shared/composables/useMessageFormatter';
import { copyTextToClipboard } from 'shared/helpers/clipboard';
import { conversationUrl, frontendURL } from 'dashboard/helper/URLHelper';
import { CONVERSATION_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';
import { parseAPIErrorResponse } from 'dashboard/store/utils/api';
import { useBranding } from 'shared/composables/useBranding';

/**
 * @typedef {Object} Attachment
 * @property {number} id - Unique identifier for the attachment
 * @property {number} messageId - ID of the associated message
 * @property {'image'|'audio'|'video'|'file'|'location'|'fallback'|'share'|'story_mention'|'contact'|'ig_reel'} fileType - Type of the attachment (file or image)
 * @property {number} accountId - ID of the associated account
 * @property {string|null} extension - File extension
 * @property {string} dataUrl - URL to access the full attachment data
 * @property {string} thumbUrl - URL to access the thumbnail version
 * @property {number} fileSize - Size of the file in bytes
 * @property {number|null} width - Width of the image if applicable
 * @property {number|null} height - Height of the image if applicable
 */

/**
 * @typedef {Object} Sender
 * @property {Object} additional_attributes - Additional attributes of the sender
 * @property {Object} custom_attributes - Custom attributes of the sender
 * @property {string} email - Email of the sender
 * @property {number} id - ID of the sender
 * @property {string|null} identifier - Identifier of the sender
 * @property {string} name - Name of the sender
 * @property {string|null} phone_number - Phone number of the sender
 * @property {string} thumbnail - Thumbnail URL of the sender
 * @property {string} type - Type of sender
 */

/**
 * @typedef {Object} ContentAttributes
 * @property {string} externalError - an error message to be shown if the message failed to send
 */

/**
 * @typedef {Object} Props
 * @property {('sent'|'delivered'|'read'|'failed'|'progress')} status - The delivery status of the message
 * @property {ContentAttributes} [contentAttributes={}] - Additional attributes of the message content
 * @property {Attachment[]} [attachments=[]] - The attachments associated with the message
 * @property {Sender|null} [sender=null] - The sender information
 * @property {boolean} [private=false] - Whether the message is private
 * @property {number|null} [senderId=null] - The ID of the sender
 * @property {number} createdAt - Timestamp when the message was created
 * @property {number} currentUserId - The ID of the current user
 * @property {number} id - The unique identifier for the message
 * @property {number} messageType - The type of message (must be one of MESSAGE_TYPES)
 * @property {string|null} [error=null] - Error message if the message failed to send
 * @property {string|null} [senderType=null] - The type of the sender
 * @property {string} content - The message content
 * @property {boolean} [groupWithNext=false] - Whether the message should be grouped with the next message
 * @property {Object|null} [inReplyTo=null] - The message to which this message is a reply
 * @property {boolean} [isEmailInbox=false] - Whether the message is from an email inbox
 * @property {number} conversationId - The ID of the conversation to which the message belongs
 * @property {number} inboxId - The ID of the inbox to which the message belongs
 */

// eslint-disable-next-line vue/define-macros-order
const props = defineProps({
  id: { type: Number, required: true },
  messageType: {
    type: Number,
    required: true,
    validator: value => Object.values(MESSAGE_TYPES).includes(value),
  },
  status: {
    type: String,
    required: true,
    validator: value => Object.values(MESSAGE_STATUS).includes(value),
  },
  attachments: { type: Array, default: () => [] },
  call: { type: Object, default: null }, // eslint-disable-line vue/no-unused-properties
  content: { type: String, default: null },
  contentAttributes: { type: Object, default: () => ({}) },
  contentType: {
    type: String,
    default: 'text',
    validator: value => Object.values(CONTENT_TYPES).includes(value),
  },
  conversationId: { type: Number, required: true },
  createdAt: { type: Number, required: true }, // eslint-disable-line vue/no-unused-properties
  currentUserId: { type: Number, required: true }, // eslint-disable-line vue/no-unused-properties
  groupWithNext: { type: Boolean, default: false },
  inboxId: { type: Number, default: null }, // eslint-disable-line vue/no-unused-properties
  inboxSupportsReplyTo: { type: Object, default: () => ({}) },
  inReplyTo: { type: Object, default: null }, // eslint-disable-line vue/no-unused-properties
  isEmailInbox: { type: Boolean, default: false },
  private: { type: Boolean, default: false },
  additionalAttributes: { type: Object, default: () => ({}) }, // eslint-disable-line vue/no-unused-properties
  sender: { type: Object, default: null },
  senderId: { type: Number, default: null },
  senderType: { type: String, default: null },
  sourceId: { type: String, default: '' }, // eslint-disable-line vue/no-unused-properties
});

const emit = defineEmits(['retry']);

const showBackgroundHighlight = ref(false);
// Right-click is suppressed when selecting text or targeting links/images so
// native copy still works; evaluated on right mousedown before `contextmenu`.
const isContextMenuDisabled = ref(false);
const isCannedResponseModalOpen = ref(false);
const showDeleteModal = ref(false);
const reportDialog = ref(null);
const { t } = useI18n();
const store = useStore();
const { getPlainText } = useMessageFormatter();
const currentAccountId = useMapGetter('getCurrentAccountId');
const uiSettings = useMapGetter('getUISettings');
const inboxGetter = useMapGetter('inboxes/getInbox');
const inbox = computed(() => inboxGetter.value(props.inboxId) || {});
const isOnChatwootCloud = useMapGetter('globalConfig/isOnChatwootCloud');
const { replaceInstallationName } = useBranding();

const isCaptainMessage = computed(() => {
  const senderType = props.sender?.type ?? props.senderType;
  return senderType === SENDER_TYPES.CAPTAIN_ASSISTANT;
});

/**
 * Computes the message variant based on props
 * @type {import('vue').ComputedRef<'user'|'agent'|'activity'|'private'|'bot'|'template'>}
 */
const variant = computed(() => {
  if (props.private) return MESSAGE_VARIANTS.PRIVATE;

  // Email is NOT its own colour variant: an email is coloured by WHO sent it
  // (agent→default / customer→muted / bot→bot), just like any other message —
  // so you can tell who was responsible. `isEmailBubble` drives the email-only
  // LAYOUT (full-width card); the surface colour comes from the variant below.

  if (props.status === MESSAGE_STATUS.FAILED) return MESSAGE_VARIANTS.ERROR;
  if (props.contentAttributes?.isUnsupported)
    return MESSAGE_VARIANTS.UNSUPPORTED;

  if (props.contentAttributes?.externalEcho) {
    return MESSAGE_VARIANTS.AGENT;
  }

  const isBot =
    props.sender?.type === SENDER_TYPES.AGENT_BOT ||
    props.senderType === SENDER_TYPES.AGENT_BOT ||
    (!props.sender && !props.additionalAttributes?.senderName);
  if (isBot && props.messageType === MESSAGE_TYPES.OUTGOING) {
    return MESSAGE_VARIANTS.BOT;
  }

  const variants = {
    [MESSAGE_TYPES.INCOMING]: MESSAGE_VARIANTS.USER,
    [MESSAGE_TYPES.ACTIVITY]: MESSAGE_VARIANTS.ACTIVITY,
    [MESSAGE_TYPES.OUTGOING]: MESSAGE_VARIANTS.AGENT,
    [MESSAGE_TYPES.TEMPLATE]: MESSAGE_VARIANTS.TEMPLATE,
  };

  return variants[props.messageType] || MESSAGE_VARIANTS.USER;
});

const isBotOrAgentMessage = computed(() => {
  if (props.messageType === MESSAGE_TYPES.ACTIVITY) {
    return false;
  }
  // if an outgoing message is still processing, then it's definitely a
  // message sent by the current user
  if (
    props.status === MESSAGE_STATUS.PROGRESS &&
    props.messageType === MESSAGE_TYPES.OUTGOING
  ) {
    return true;
  }
  const senderId = props.senderId ?? props.sender?.id;
  const senderType = props.sender?.type ?? props.senderType;

  if (!senderType || !senderId) {
    return true;
  }

  if (
    [SENDER_TYPES.AGENT_BOT, SENDER_TYPES.CAPTAIN_ASSISTANT].includes(
      senderType
    )
  ) {
    return true;
  }

  return senderType.toLowerCase() === SENDER_TYPES.USER.toLowerCase();
});

/**
 * Computes the message orientation based on sender type and message type
 * @returns {import('vue').ComputedRef<'left'|'right'|'center'>} The computed orientation
 */
const orientation = computed(() => {
  if (isBotOrAgentMessage.value) {
    return ORIENTATION.RIGHT;
  }

  if (props.messageType === MESSAGE_TYPES.ACTIVITY) return ORIENTATION.CENTER;

  return ORIENTATION.LEFT;
});

const flexOrientationClass = computed(() => {
  const map = {
    [ORIENTATION.LEFT]: 'justify-start',
    [ORIENTATION.RIGHT]: 'justify-end',
    [ORIENTATION.CENTER]: 'justify-center',
  };

  return map[orientation.value];
});

const shouldGroupWithNext = computed(() => {
  if (props.status === MESSAGE_STATUS.FAILED) return false;

  return props.groupWithNext;
});

const shouldShowAvatar = computed(() => {
  if (props.messageType === MESSAGE_TYPES.ACTIVITY) return false;
  if (orientation.value === ORIENTATION.LEFT) return false;

  return true;
});

const componentToRender = computed(() => {
  if (props.isEmailInbox && !props.private) {
    const emailInboxTypes = [MESSAGE_TYPES.INCOMING, MESSAGE_TYPES.OUTGOING];
    if (emailInboxTypes.includes(props.messageType)) return EmailBubble;
  }

  if (props.contentAttributes?.whatsappFlowResponse) {
    return WhatsappFlowResponseBubble;
  }

  if (props.contentType === CONTENT_TYPES.INPUT_CSAT) {
    return CSATBubble;
  }

  if (
    [CONTENT_TYPES.INPUT_SELECT, CONTENT_TYPES.FORM].includes(props.contentType)
  ) {
    return FormBubble;
  }

  if (props.contentType === CONTENT_TYPES.VOICE_CALL) {
    return VoiceCallBubble;
  }

  if (props.contentType === CONTENT_TYPES.INCOMING_EMAIL) {
    return EmailBubble;
  }

  if (props.contentAttributes?.isUnsupported) {
    return UnsupportedBubble;
  }

  if (props.contentAttributes.type === 'dyte') {
    return DyteBubble;
  }

  const instagramSharedTypes = [
    ATTACHMENT_TYPES.STORY_MENTION,
    ATTACHMENT_TYPES.IG_STORY,
    ATTACHMENT_TYPES.IG_STORY_REPLY,
    ATTACHMENT_TYPES.IG_POST,
  ];
  if (instagramSharedTypes.includes(props.contentAttributes.imageType)) {
    return InstagramStoryBubble;
  }

  if (Array.isArray(props.attachments) && props.attachments.length === 1) {
    const fileType = props.attachments[0].fileType;

    if (fileType === ATTACHMENT_TYPES.FALLBACK) return FallbackBubble;

    if (!props.content) {
      if (fileType === ATTACHMENT_TYPES.IMAGE) return ImageBubble;
      if (fileType === ATTACHMENT_TYPES.FILE) return FileBubble;
      if (fileType === ATTACHMENT_TYPES.AUDIO) return AudioBubble;
      if (fileType === ATTACHMENT_TYPES.VIDEO) return VideoBubble;
      if (fileType === ATTACHMENT_TYPES.IG_REEL) return VideoBubble;
      if (fileType === ATTACHMENT_TYPES.EMBED) return EmbedBubble;
      if (fileType === ATTACHMENT_TYPES.LOCATION) return LocationBubble;
    }
    // Attachment content is the name of the contact
    if (fileType === ATTACHMENT_TYPES.CONTACT) return ContactBubble;
  }

  return TextBubble;
});

// Email renders a full-width card (its own header/body). This is a LAYOUT flag,
// independent of the colour variant (which is agent/customer/bot based).
const isEmailBubble = computed(() => componentToRender.value === EmailBubble);

const shouldShowContextMenu = computed(() => {
  return !props.contentAttributes?.isUnsupported;
});

const isBubble = computed(() => {
  return props.messageType !== MESSAGE_TYPES.ACTIVITY;
});

// Activity messages ("John added/assigned…") are markers, not bubbles.
const activityTime = computed(() =>
  messageTimestamp(props.createdAt, 'LLL d, h:mm a')
);

// shadcn Message align (own the row layout instead of the old CSS grid).
const messageAlign = computed(() =>
  orientation.value === ORIENTATION.RIGHT ? 'end' : 'start'
);

// Timestamp + read-receipt live in a MessageFooter BELOW the bubble (shadcn
// pattern) so they stay readable on every variant — inside a primary/dark
// bubble the muted meta color was unreadable. VoiceCall manages its own layout
// (it passed hide-meta), so keep it excluded.
const isVoiceCall = computed(
  () => props.contentType === CONTENT_TYPES.VOICE_CALL
);
const showMeta = computed(
  () =>
    isBubble.value &&
    !shouldGroupWithNext.value &&
    !isVoiceCall.value &&
    variant.value !== MESSAGE_VARIANTS.ACTIVITY
);

const isMessageDeleted = computed(() => {
  return props.contentAttributes?.deleted;
});

const shouldShowWhatsappReferral = computed(
  () =>
    variant.value === MESSAGE_VARIANTS.USER &&
    !!props.contentAttributes?.referral
);

const contextMenuEnabledOptions = computed(() => {
  const hasText = !!props.content;
  const hasAttachments = !!(props.attachments && props.attachments.length > 0);

  const isOutgoing = props.messageType === MESSAGE_TYPES.OUTGOING;
  const isFailedOrProcessing =
    props.status === MESSAGE_STATUS.FAILED ||
    props.status === MESSAGE_STATUS.PROGRESS;

  return {
    copy: hasText,
    delete:
      (hasText || hasAttachments) &&
      !isFailedOrProcessing &&
      !isMessageDeleted.value,
    cannedResponse: isOutgoing && hasText && !isMessageDeleted.value,
    copyLink: !isFailedOrProcessing,
    translate: !isFailedOrProcessing && !isMessageDeleted.value && hasText,
    replyTo:
      !props.private &&
      props.inboxSupportsReplyTo.outgoing &&
      !isFailedOrProcessing,
    report:
      isOnChatwootCloud.value &&
      isCaptainMessage.value &&
      !isMessageDeleted.value,
  };
});

const shouldRenderMessage = computed(() => {
  const hasAttachments = !!(props.attachments && props.attachments.length > 0);
  const isEmailContentType = props.contentType === CONTENT_TYPES.INCOMING_EMAIL;
  const isUnsupported = props.contentAttributes?.isUnsupported;
  const isAnIntegrationMessage =
    props.contentType === CONTENT_TYPES.INTEGRATIONS;
  const hasWhatsappFlowResponse =
    !!props.contentAttributes?.whatsappFlowResponse;
  const isFailedMessage = props.status === MESSAGE_STATUS.FAILED;
  const hasExternalError = !!props.contentAttributes?.externalError;

  return (
    hasAttachments ||
    props.content ||
    isEmailContentType ||
    isUnsupported ||
    isAnIntegrationMessage ||
    hasWhatsappFlowResponse ||
    shouldShowWhatsappReferral.value ||
    isFailedMessage ||
    hasExternalError
  );
});

// Decide on right mousedown (fires before `contextmenu`) whether the menu
// should be suppressed, so reka's ContextMenuTrigger stays disabled for links,
// images, opt-out targets, or when the user is selecting text to copy.
function onContextMenuMouseDown(e) {
  if (e.button !== 2) return;
  // Media bubbles are now naked (no bubble-chrome to right-click), so the app
  // context menu must work on the media itself — saving is covered by the
  // per-media download button / gallery. Only links keep the native menu
  // (copy link / open) and explicit skip-context-menu opt-outs are honored.
  isContextMenuDisabled.value =
    e.target?.classList.contains('skip-context-menu') ||
    e.target?.tagName?.toLowerCase() === 'a' ||
    !!getSelection().toString();
}

function onContextMenuOpenChange(isOpen) {
  if (isOpen) useTrack(ACCOUNT_EVENTS.OPEN_MESSAGE_CONTEXT_MENU);
}

const plainTextContent = computed(() => getPlainText(props.content));

async function handleCopy() {
  await copyTextToClipboard(plainTextContent.value);
  useAlert(t('CONTACT_PANEL.COPY_SUCCESSFUL'));
}

async function copyLinkToMessage() {
  const fullConversationURL =
    window.chatwootConfig.hostURL +
    frontendURL(
      conversationUrl({
        id: props.conversationId,
        accountId: currentAccountId.value,
      })
    );
  await copyTextToClipboard(`${fullConversationURL}?messageId=${props.id}`);
  useAlert(t('CONVERSATION.CONTEXT_MENU.LINK_COPIED'));
}

async function handleTranslate() {
  const account = store.getters['accounts/getAccount'](currentAccountId.value);
  const targetLanguage = uiSettings.value?.locale || account?.locale || 'en';
  try {
    await store.dispatch('translateMessage', {
      conversationId: props.conversationId,
      messageId: props.id,
      targetLanguage,
    });
    useTrack(CONVERSATION_EVENTS.TRANSLATE_A_MESSAGE);
  } catch (error) {
    useAlert(parseAPIErrorResponse(error));
  }
}

function openReportDialog() {
  reportDialog.value?.open();
}

async function confirmDeletion() {
  try {
    await store.dispatch('deleteMessage', {
      conversationId: props.conversationId,
      messageId: props.id,
    });
    useAlert(t('CONVERSATION.SUCCESS_DELETE_MESSAGE'));
  } catch (error) {
    useAlert(t('CONVERSATION.FAIL_DELETE_MESSSAGE'));
  }
  showDeleteModal.value = false;
}

function handleReplyTo() {
  const replyStorageKey = LOCAL_STORAGE_KEYS.MESSAGE_REPLY_TO;
  const { conversationId, id: replyTo } = props;

  LocalStorage.updateJsonStore(replyStorageKey, conversationId, replyTo);
  emitter.emit(BUS_EVENTS.TOGGLE_REPLY_TO_MESSAGE, props);
}

const avatarInfo = computed(() => {
  if (props.contentAttributes?.externalEcho) {
    const { name, avatar_url, channel_type, medium, voice_enabled } =
      inbox.value;
    const iconName = avatar_url
      ? null
      : getInboxIconByType(channel_type, medium, 'fill', voice_enabled);
    return {
      name: iconName ? '' : name || t('CONVERSATION.NATIVE_APP'),
      src: avatar_url || '',
      iconName,
    };
  }

  // If no sender, check for Slack (or other integration) sender info
  if (!props.sender) {
    const { senderName, senderAvatarUrl } = props.additionalAttributes || {};
    if (senderName) {
      return { name: senderName, src: senderAvatarUrl ?? '' };
    }
    return { name: t('CONVERSATION.BOT'), src: '' };
  }

  const { sender } = props;
  const { name, type, avatarUrl, thumbnail } = sender || {};

  // If sender type is agent bot, use avatarUrl
  if ([SENDER_TYPES.AGENT_BOT, SENDER_TYPES.CAPTAIN_ASSISTANT].includes(type)) {
    return {
      name: name ?? '',
      src: avatarUrl ?? '',
    };
  }

  // For all other senders, use thumbnail
  return {
    name: name ?? '',
    src: thumbnail ?? '',
  };
});

const avatarTooltip = computed(() => {
  if (props.contentAttributes?.externalEcho) {
    return replaceInstallationName(t('CONVERSATION.NATIVE_APP_ADVISORY'));
  }
  if (avatarInfo.value.name === '') return '';
  return `${t('CONVERSATION.SENT_BY')} ${avatarInfo.value.name}`;
});

// Two-letter fallback for the shadcn Avatar when there's no image.
const avatarInitials = computed(() => {
  const name = avatarInfo.value.name || '';
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase() || '?'
  );
});

const setupHighlightTimer = () => {
  const messageId = new URLSearchParams(window.location.search).get(
    'messageId'
  );
  if (Number(messageId) !== Number(props.id)) {
    return;
  }

  showBackgroundHighlight.value = true;
  const HIGHLIGHT_TIMER = 1000;
  useTimeoutFn(() => {
    showBackgroundHighlight.value = false;
  }, HIGHLIGHT_TIMER);
};

onMounted(setupHighlightTimer);

provideMessageContext({
  ...toRefs(props),
  isPrivate: computed(() => props.private),
  variant,
  orientation,
  isBotOrAgentMessage,
  shouldGroupWithNext,
});
</script>

<!-- eslint-disable-next-line vue/no-root-v-if -->
<template>
  <div
    v-if="shouldRenderMessage"
    :id="`message${props.id}`"
    class="flex mb-2 w-full message-bubble-container"
    :data-message-id="props.id"
    :class="[
      flexOrientationClass,
      {
        'group-with-next': shouldGroupWithNext,
        'bg-n-alpha-1': showBackgroundHighlight,
      },
    ]"
  >
    <Marker
      v-if="variant === MESSAGE_VARIANTS.ACTIVITY"
      v-tooltip.top="activityTime"
      variant="separator"
      class="px-3 py-1"
    >
      <MarkerContent>
        <span :title="content">{{ content }}</span>
      </MarkerContent>
    </Marker>
    <MessageRoot v-else :align="messageAlign">
      <!-- Reserve the avatar gutter for every message in an outgoing group so
           they align to the same edge; only the last message of the group
           actually renders the avatar. -->
      <MessageAvatar
        v-if="shouldShowAvatar"
        v-tooltip.left-end="shouldGroupWithNext ? '' : avatarTooltip"
        class="bg-transparent"
      >
        <Avatar
          v-if="!shouldGroupWithNext"
          class="size-6 bg-muted text-[10px] font-medium text-foreground"
        >
          <AvatarImage
            v-if="avatarInfo.src"
            :src="avatarInfo.src"
            :alt="avatarInfo.name"
          />
          <AvatarFallback class="bg-muted text-foreground">
            <Icon
              v-if="avatarInfo.iconName"
              :icon="avatarInfo.iconName"
              class="size-3.5"
            />
            <template v-else>{{ avatarInitials }}</template>
          </AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent
        :class="[
          messageAlign === 'end' ? 'items-end' : 'items-start',
          { 'w-full': isEmailBubble },
        ]"
      >
        <ContextMenu
          v-if="shouldShowContextMenu && isBubble"
          @update:open="onContextMenuOpenChange"
        >
          <ContextMenuTrigger as-child :disabled="isContextMenuDisabled">
            <div
              class="flex min-w-0"
              :class="{
                'w-full': isEmailBubble,
                'flex-col items-start gap-2': shouldShowWhatsappReferral,
              }"
              @mousedown="onContextMenuMouseDown"
            >
              <WhatsappReferral
                v-if="shouldShowWhatsappReferral"
                :referral="contentAttributes.referral"
              />
              <Component :is="componentToRender" />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent class="w-56">
            <ContextMenuItem
              v-if="contextMenuEnabledOptions.replyTo"
              class="gap-2"
              @select="handleReplyTo"
            >
              <Icon icon="i-lucide-reply" class="size-4" />
              {{ t('CONVERSATION.CONTEXT_MENU.REPLY_TO') }}
            </ContextMenuItem>
            <ContextMenuItem
              v-if="contextMenuEnabledOptions.copy"
              class="gap-2"
              @select="handleCopy"
            >
              <Icon icon="i-lucide-clipboard" class="size-4" />
              {{ t('CONVERSATION.CONTEXT_MENU.COPY') }}
            </ContextMenuItem>
            <ContextMenuItem
              v-if="contextMenuEnabledOptions.translate"
              class="gap-2"
              @select="handleTranslate"
            >
              <Icon icon="i-lucide-languages" class="size-4" />
              {{ t('CONVERSATION.CONTEXT_MENU.TRANSLATE') }}
            </ContextMenuItem>
            <ContextMenuSeparator
              v-if="
                contextMenuEnabledOptions.copyLink ||
                contextMenuEnabledOptions.cannedResponse
              "
            />
            <ContextMenuItem
              v-if="contextMenuEnabledOptions.copyLink"
              class="gap-2"
              @select="copyLinkToMessage"
            >
              <Icon icon="i-lucide-link" class="size-4" />
              {{ t('CONVERSATION.CONTEXT_MENU.COPY_PERMALINK') }}
            </ContextMenuItem>
            <ContextMenuItem
              v-if="contextMenuEnabledOptions.cannedResponse"
              class="gap-2"
              @select="isCannedResponseModalOpen = true"
            >
              <Icon icon="i-lucide-message-square-plus" class="size-4" />
              {{ t('CONVERSATION.CONTEXT_MENU.CREATE_A_CANNED_RESPONSE') }}
            </ContextMenuItem>
            <ContextMenuSeparator v-if="contextMenuEnabledOptions.report" />
            <ContextMenuItem
              v-if="contextMenuEnabledOptions.report"
              class="gap-2"
              @select="openReportDialog"
            >
              <Icon icon="i-lucide-triangle-alert" class="size-4" />
              {{ t('CONVERSATION.CONTEXT_MENU.REPORT_MESSAGE.LABEL') }}
            </ContextMenuItem>
            <ContextMenuSeparator v-if="contextMenuEnabledOptions.delete" />
            <ContextMenuItem
              v-if="contextMenuEnabledOptions.delete"
              class="gap-2 text-n-ruby-11"
              @select="showDeleteModal = true"
            >
              <Icon icon="i-lucide-trash-2" class="size-4" />
              {{ t('CONVERSATION.CONTEXT_MENU.DELETE') }}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <div
          v-else
          class="flex min-w-0"
          :class="{
            'w-full': isEmailBubble,
            'flex-col items-start gap-2': shouldShowWhatsappReferral,
          }"
        >
          <WhatsappReferral
            v-if="shouldShowWhatsappReferral"
            :referral="contentAttributes.referral"
          />
          <Component :is="componentToRender" />
        </div>
        <MessageError
          v-if="contentAttributes.externalError"
          :error="contentAttributes.externalError"
          @retry="emit('retry')"
        />
        <MessageFooter v-if="showMeta">
          <CaptainGenerationDetails v-if="isCaptainMessage" :message-id="id">
            <template #meta>
              <MessageMeta />
            </template>
          </CaptainGenerationDetails>
          <MessageMeta v-else />
        </MessageFooter>
      </MessageContent>
    </MessageRoot>
    <AddCannedModal
      v-if="contextMenuEnabledOptions.cannedResponse"
      v-model:open="isCannedResponseModalOpen"
      :response-content="plainTextContent"
    />

    <ReportCaptainMessageDialog
      v-if="contextMenuEnabledOptions.report"
      ref="reportDialog"
      :message-id="id"
    />

    <AlertDialog
      v-if="contextMenuEnabledOptions.delete"
      :open="showDeleteModal"
      @update:open="showDeleteModal = $event"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ t('CONVERSATION.CONTEXT_MENU.DELETE_CONFIRMATION.TITLE') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('CONVERSATION.CONTEXT_MENU.DELETE_CONFIRMATION.MESSAGE') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="showDeleteModal = false">
            {{ t('CONVERSATION.CONTEXT_MENU.DELETE_CONFIRMATION.CANCEL') }}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" @click="confirmDeletion">
            {{ t('CONVERSATION.CONTEXT_MENU.DELETE_CONFIRMATION.DELETE') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<style lang="scss">
.group-with-next + .message-bubble-container {
  .left-bubble {
    @apply ltr:rounded-tl-sm rtl:rounded-tr-sm;
  }

  .right-bubble {
    @apply ltr:rounded-tr-sm rtl:rounded-tl-sm;
  }
}
</style>
