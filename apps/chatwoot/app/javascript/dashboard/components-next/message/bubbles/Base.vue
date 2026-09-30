<script setup>
import { computed } from 'vue';

import { Bubble, BubbleContent } from 'next/ui/bubble';

import { emitter } from 'shared/helpers/mitt';
import { useMessageContext } from '../provider.js';
import { useI18n } from 'vue-i18n';

import MessageFormatter from 'shared/helpers/MessageFormatter.js';
import { BUS_EVENTS } from 'shared/constants/busEvents';
import { MESSAGE_VARIANTS } from '../constants';

const props = defineProps({
  hideMeta: { type: Boolean, default: false }, // eslint-disable-line vue/no-unused-properties
  // Media/attachment content carries its own surface (image, audio card, shadcn
  // Attachment). Render on a naked `ghost` bubble so the colored variant surface
  // (default→primary etc.) doesn't wrap it. A plain `bg-transparent` class can't
  // beat the variant's `*:data-[slot=bubble-content]:bg-*` child-selector; the
  // ghost variant zeroes bg/padding/radius via the same child-selector, so it wins.
  transparent: { type: Boolean, default: false },
  // Full-width bubble with zero content padding (the child manages its own
  // padding). Used by the Email card, which spans the row and is coloured by
  // its normal sender variant (agent/customer/bot) like any other message.
  fullWidth: { type: Boolean, default: false },
});

// Route the content's own attrs (e.g. the per-type padding class `px-4 py-3` and
// `data-bubble-name`) onto the shadcn BubbleContent (tailwind-merge resolves the padding).
defineOptions({ inheritAttrs: false });

const { variant, inReplyTo } = useMessageContext();
const { t } = useI18n();

// chatwoot MESSAGE_VARIANTS -> shadcn Bubble variant (theme-managed where an equivalent
// exists; private/bot are app-specific variants added to ui/bubble).
const VARIANT_MAP = {
  [MESSAGE_VARIANTS.AGENT]: 'default',
  [MESSAGE_VARIANTS.USER]: 'muted',
  [MESSAGE_VARIANTS.PRIVATE]: 'private',
  [MESSAGE_VARIANTS.BOT]: 'bot',
  [MESSAGE_VARIANTS.TEMPLATE]: 'bot',
  [MESSAGE_VARIANTS.ERROR]: 'destructive',
  [MESSAGE_VARIANTS.UNSUPPORTED]: 'outline',
  [MESSAGE_VARIANTS.ACTIVITY]: 'muted',
};

const bubbleVariant = computed(() =>
  props.transparent ? 'ghost' : (VARIANT_MAP[variant.value] ?? 'muted')
);

const scrollToMessage = () => {
  emitter.emit(BUS_EVENTS.SCROLL_TO_MESSAGE, {
    messageId: inReplyTo.value.id,
  });
};

const replyToPreview = computed(() => {
  if (!inReplyTo) return '';

  const { content, attachments } = inReplyTo.value;

  if (content) return new MessageFormatter(content).formattedMessage;
  if (attachments?.length) {
    const firstAttachment = attachments[0];
    const fileType = firstAttachment.fileType ?? firstAttachment.file_type;

    return t(`CHAT_LIST.ATTACHMENTS.${fileType}.CONTENT`);
  }

  return t('CONVERSATION.REPLY_MESSAGE_NOT_FOUND');
});
</script>

<template>
  <!-- Alignment is still owned by the parent Message.vue grid; this step only moves the
       bubble surface (bg/border/radius) onto the shadcn Bubble variants. -->
  <Bubble
    :variant="bubbleVariant"
    class="min-w-0"
    :class="fullWidth ? 'w-full max-w-full' : 'max-w-lg'"
  >
    <BubbleContent
      v-bind="$attrs"
      class="text-sm"
      :class="[
        fullWidth ? 'w-full p-0' : '',
        // The ghost variant (used by transparent media) drops the max width to
        // full; cap the content so the w-fit bubble shrinks back to a sane size.
        transparent && !fullWidth ? 'max-w-lg' : '',
        variant === MESSAGE_VARIANTS.UNSUPPORTED ? 'border-dashed' : '',
      ]"
    >
      <div
        v-if="inReplyTo"
        class="p-2 -mx-1 mb-2 rounded-lg cursor-pointer bg-n-alpha-black1"
        @click="scrollToMessage"
      >
        <div
          v-dompurify-html="replyToPreview"
          class="prose prose-bubble line-clamp-2"
        />
      </div>
      <!-- Timestamp + read-receipt moved out to Message.vue's MessageFooter
           (shadcn pattern) so meta stays readable on every bubble variant. -->
      <slot />
    </BubbleContent>
  </Bubble>
</template>
