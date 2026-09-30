<script>
import FluentIcon from 'shared/components/FluentIcon/Index.vue';
import { Button } from 'dashboard/components-next/ui/button';

export default {
  name: 'FooterReplyTo',
  components: { FluentIcon },
  props: {
    inReplyTo: {
      type: Object,
      default: () => {},
    },
  },
  emits: ['dismiss'],
  computed: {
    replyToAttachment() {
      if (!this.inReplyTo?.attachments?.length) {
        return '';
      }

      const [{ file_type: fileType } = {}] = this.inReplyTo.attachments;
      return this.$t(`ATTACHMENTS.${fileType}.CONTENT`);
    },
  },
};
</script>

<template>
  <div
    class="mb-2.5 rounded-[7px] bg-n-slate-3 px-2 py-1.5 text-sm text-n-slate-11 flex items-center gap-2"
  >
    <div class="items-center flex-grow truncate">
      <strong>{{ $t('FOOTER_REPLY_TO.REPLY_TO') }}</strong>
      {{ inReplyTo.content || replyToAttachment }}
    </div>
    <Button
      variant="ghost"
      size="icon"
      class="size-auto shrink-0 p-1 hover:bg-n-slate-5"
      @click="$emit('dismiss')"
    >
      <FluentIcon icon="dismiss" size="12" />
    </Button>
  </div>
</template>
