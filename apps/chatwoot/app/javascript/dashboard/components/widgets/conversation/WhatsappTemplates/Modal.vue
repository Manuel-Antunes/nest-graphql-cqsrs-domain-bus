<script>
import TemplatesPicker from './TemplatesPicker.vue';
import WhatsAppTemplateReply from './WhatsAppTemplateReply.vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from 'dashboard/components-next/ui/dialog';
export default {
  components: {
    TemplatesPicker,
    WhatsAppTemplateReply,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
  },
  props: {
    show: {
      type: Boolean,
      default: false,
    },
    inboxId: {
      type: Number,
      default: undefined,
    },
  },
  emits: ['onSend', 'cancel', 'update:show'],
  data() {
    return {
      selectedWaTemplate: null,
    };
  },
  computed: {
    localShow: {
      get() {
        return this.show;
      },
      set(value) {
        this.$emit('update:show', value);
      },
    },
    modalHeaderContent() {
      return this.selectedWaTemplate
        ? this.$t('WHATSAPP_TEMPLATES.MODAL.TEMPLATE_SELECTED_SUBTITLE', {
            templateName: this.selectedWaTemplate.name,
          })
        : this.$t('WHATSAPP_TEMPLATES.MODAL.SUBTITLE');
    },
  },
  methods: {
    pickTemplate(template) {
      this.selectedWaTemplate = template;
    },
    onResetTemplate() {
      this.selectedWaTemplate = null;
    },
    onSendMessage(message) {
      this.$emit('onSend', message);
    },
    onClose() {
      this.$emit('cancel');
    },
  },
};
</script>

<template>
  <Dialog
    :open="localShow"
    @update:open="
      val => {
        if (!val) {
          onClose();
          localShow = false;
        }
      }
    "
  >
    <DialogContent class="max-w-4xl w-full">
      <DialogHeader>
        <DialogTitle>{{ $t('WHATSAPP_TEMPLATES.MODAL.TITLE') }}</DialogTitle>
        <DialogDescription>{{ modalHeaderContent }}</DialogDescription>
      </DialogHeader>
      <div class="row">
        <TemplatesPicker
          v-if="!selectedWaTemplate"
          :inbox-id="inboxId"
          @on-select="pickTemplate"
        />
        <WhatsAppTemplateReply
          v-else
          :template="selectedWaTemplate"
          @reset-template="onResetTemplate"
          @send-message="onSendMessage"
        />
      </div>
    </DialogContent>
  </Dialog>
</template>
