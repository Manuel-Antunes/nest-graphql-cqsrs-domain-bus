<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import BaseBubble from './Base.vue';
import Icon from 'next/icon/Icon.vue';
import { Button } from 'next/ui/button';
import {
  Attachment,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
} from 'next/ui/attachment';
import { useMessageContext } from '../provider.js';

defineProps({
  icon: { type: [String, Object], required: true },
  iconBgColor: { type: String, default: 'bg-n-alpha-3' },
  senderTranslationKey: { type: String, required: true },
  content: { type: String, required: true },
  title: { type: String, default: '' }, // Title can be any name, description, etc
  action: {
    type: Object,
    required: true,
    validator: action => {
      return action.label && (action.href || action.onClick);
    },
  },
});

const { sender } = useMessageContext();
const { t } = useI18n();

const senderName = computed(() => {
  return sender?.value?.name || '';
});
</script>

<template>
  <!-- Media/attachment cards carry their own shadcn Attachment surface, so the bubble is
       naked (transparent). Attachment = rounded-xl border bg-card (the shadcn card). -->
  <BaseBubble transparent data-bubble-name="attachment">
    <Attachment class="w-full max-w-full">
      <AttachmentMedia :class="[iconBgColor]">
        <slot name="icon">
          <Icon :icon="icon" class="text-white size-4" />
        </slot>
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle v-if="senderName">
          {{ t(senderTranslationKey, { sender: senderName }) }}
        </AttachmentTitle>
        <slot>
          <AttachmentDescription v-if="title" class="text-card-foreground">
            {{ title }}
          </AttachmentDescription>
          <AttachmentDescription v-if="content">
            {{ content }}
          </AttachmentDescription>
        </slot>
      </AttachmentContent>
      <AttachmentActions v-if="action">
        <Button
          v-if="action.href"
          as="a"
          :href="action.href"
          rel="noreferrer noopener nofollow"
          target="_blank"
          variant="outline"
          size="sm"
        >
          {{ action.label }}
        </Button>
        <Button v-else variant="outline" size="sm" @click="action.onClick">
          {{ action.label }}
        </Button>
      </AttachmentActions>
    </Attachment>
  </BaseBubble>
</template>
