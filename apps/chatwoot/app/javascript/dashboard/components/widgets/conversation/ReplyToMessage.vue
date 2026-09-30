<script setup>
import MessagePreview from 'dashboard/components/widgets/conversation/MessagePreview.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';

defineProps({
  message: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['dismiss']);
</script>

<template>
  <div
    class="reply-editor bg-n-slate-9/10 rounded-md py-1 pl-2 pr-1 text-xs tracking-wide mt-2 flex items-center gap-1.5 -mx-2"
  >
    <fluent-icon class="flex-shrink-0 icon" icon="arrow-reply" size="14" />
    <div class="flex-grow gap-1 mt-px text-xs truncate">
      {{ $t('CONVERSATION.REPLYBOX.REPLYING_TO') }}
      <MessagePreview
        :message="message"
        :show-message-type="false"
        :default-empty-message="$t('CONVERSATION.REPLY_MESSAGE_NOT_FOUND')"
        class="inline"
      />
    </div>
    <Button
      v-tooltip="$t('CONVERSATION.REPLYBOX.DISMISS_REPLY')"
      variant="ghost"
      size="icon"
      @click.stop="emit('dismiss')"
    >
      <Icon icon="i-lucide-x" />
    </Button>
  </div>
</template>

<style lang="scss">
// TODO: Remove this
// override for dashboard/assets/scss/widgets/_reply-box.scss
.reply-editor {
  .icon {
    margin-right: 0px !important;
  }
}
</style>
