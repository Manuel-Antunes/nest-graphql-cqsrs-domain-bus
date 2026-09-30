<script setup>
import WhatsAppTemplateParser from 'dashboard/components-next/whatsapp/WhatsAppTemplateParser.vue';
import { Button } from 'dashboard/components-next/ui/button';

defineProps({
  template: {
    type: Object,
    default: () => ({}),
  },
  sendRenderedContent: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['sendMessage', 'resetTemplate']);

const handleSendMessage = payload => {
  emit('sendMessage', payload);
};

const handleResetTemplate = () => {
  emit('resetTemplate');
};
</script>

<template>
  <div class="w-full">
    <WhatsAppTemplateParser
      :template="template"
      :send-rendered-content="sendRenderedContent"
      @send-message="handleSendMessage"
      @reset-template="handleResetTemplate"
    >
      <template #actions="{ sendMessage, resetTemplate, disabled }">
        <footer class="flex gap-2 justify-end">
          <Button variant="outline" type="reset" @click="resetTemplate">
            {{ $t('WHATSAPP_TEMPLATES.PARSER.GO_BACK_LABEL') }}
          </Button>
          <Button type="button" :disabled="disabled" @click="sendMessage">
            {{ $t('WHATSAPP_TEMPLATES.PARSER.SEND_MESSAGE_LABEL') }}
          </Button>
        </footer>
      </template>
    </WhatsAppTemplateParser>
  </div>
</template>
