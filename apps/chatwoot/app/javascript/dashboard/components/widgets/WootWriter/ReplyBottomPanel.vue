<script>
import { ref } from 'vue';
import { useKeyboardEvents } from 'dashboard/composables/useKeyboardEvents';
import FileUpload from 'vue-upload-component';
import * as ActiveStorage from 'activestorage';
import inboxMixin from 'shared/mixins/inboxMixin';
import { getAllowedFileTypesByChannel } from '@chatwoot/utils';
import { INBOX_TYPES } from 'dashboard/helper/inbox';

export default {
  name: 'ReplyBottomPanel',
  components: { FileUpload },
  mixins: [inboxMixin],
  props: {
    isNote: {
      type: Boolean,
      default: false,
    },
    // inbox prop is used in /mixins/inboxMixin,
    // remove this props when refactoring to composable if not needed
    // eslint-disable-next-line vue/no-unused-properties
    inbox: {
      type: Object,
      default: () => ({}),
    },
    showFileUpload: {
      type: Boolean,
      default: false,
    },
    onFileUpload: {
      type: Function,
      default: () => {},
    },
    isOnPrivateNote: {
      type: Boolean,
      default: false,
    },
    enableMultipleFileUpload: {
      type: Boolean,
      default: true,
    },
    newConversationModalActive: {
      type: Boolean,
      default: false,
    },
    conversationType: {
      type: String,
      default: '',
    },
    isEditorDisabled: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const uploadRef = ref(false);

    const keyboardEvents = {
      '$mod+Alt+KeyA': {
        action: () => {
          // Skip if editor is disabled (e.g., WhatsApp 24-hour window expired)
          if (props.isEditorDisabled) return;

          // TODO: This is really hacky, we need to replace the file picker component with
          // a custom one, where the logic and the component markup is isolated.
          // Once we have the custom component, we can remove the hacky logic below.

          const uploadTriggerButton = document.querySelector(
            '#conversationAttachment'
          );
          if (uploadTriggerButton) uploadTriggerButton.click();
        },
        allowOnFocusedInput: true,
      },
    };

    useKeyboardEvents(keyboardEvents);

    return {
      uploadRef,
    };
  },
  computed: {
    wrapClass() {
      return {
        'is-note-mode': this.isNote,
      };
    },
    showAttachButton() {
      if (this.isEditorDisabled) return false;
      return this.showFileUpload || this.isNote;
    },
    isInstagramDM() {
      return this.conversationType === 'instagram_direct_message';
    },
    allowedFileTypes() {
      if (this.isOnPrivateNote) {
        return getAllowedFileTypesByChannel();
      }

      let channelType = this.channelType || this.inbox?.channel_type;
      if (this.isAnInstagramChannel || this.isInstagramDM) {
        channelType = INBOX_TYPES.INSTAGRAM;
      }

      return getAllowedFileTypesByChannel({
        channelType,
        medium: this.inbox?.medium,
      });
    },
    enableDragAndDrop() {
      return !this.newConversationModalActive;
    },
  },
  mounted() {
    ActiveStorage.start();
  },
};
</script>

<template>
  <div :class="wrapClass">
    <span class="hidden">
      <FileUpload
        v-if="showAttachButton"
        ref="uploadRef"
        input-id="conversationAttachment"
        :size="4096 * 4096"
        :accept="allowedFileTypes"
        :multiple="enableMultipleFileUpload"
        :drop="enableDragAndDrop"
        :drop-directory="false"
        :data="{
          direct_upload_url: '/rails/active_storage/direct_uploads',
          direct_upload: true,
        }"
        @input-file="onFileUpload"
      >
        <span />
      </FileUpload>
    </span>
    <transition name="modal-fade">
      <div
        v-show="uploadRef && uploadRef.dropActive"
        class="flex fixed top-0 right-0 bottom-0 left-0 z-20 flex-col gap-2 justify-center items-center w-full h-full text-n-slate-12 bg-modal-backdrop-light dark:bg-modal-backdrop-dark"
      >
        <fluent-icon icon="cloud-backup" size="40" />
        <h4 class="text-2xl break-words text-n-slate-12">
          {{ $t('CONVERSATION.REPLYBOX.DRAG_DROP') }}
        </h4>
      </div>
    </transition>
  </div>
</template>

<style lang="scss" scoped>
:deep(.file-uploads) {
  label {
    @apply cursor-pointer;
  }
}
</style>
