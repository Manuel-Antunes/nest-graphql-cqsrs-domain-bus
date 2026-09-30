<script setup>
import WhatsAppTemplateParser from 'dashboard/components-next/whatsapp/WhatsAppTemplateParser.vue';
import { Button } from 'dashboard/components-next/ui/button';
import { useI18n } from 'vue-i18n';

defineProps({
  template: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['sendMessage', 'back']);

const { t } = useI18n();

const handleSendMessage = payload => {
  emit('sendMessage', payload);
};

const handleBack = () => {
  emit('back');
};
</script>

<template>
  <div class="flex flex-col gap-4 px-4 pt-6 pb-5 items-start w-[28.75rem]">
    <div class="w-full">
      <WhatsAppTemplateParser
        :template="template"
        @send-message="handleSendMessage"
        @back="handleBack"
      >
        <template #actions="{ sendMessage, goBack, disabled }">
          <div class="flex gap-3 justify-between items-end w-full h-14">
            <Button
              variant="outline"
              class="w-full font-medium"
              @click="goBack"
            >
              {{
                t(
                  'COMPOSE_NEW_CONVERSATION.FORM.WHATSAPP_OPTIONS.TEMPLATE_PARSER.BACK'
                )
              }}
            </Button>
            <Button
              variant="default"
              class="w-full font-medium"
              :disabled="disabled"
              @click="sendMessage"
            >
              {{
                t(
                  'COMPOSE_NEW_CONVERSATION.FORM.WHATSAPP_OPTIONS.TEMPLATE_PARSER.SEND_MESSAGE'
                )
              }}
            </Button>
          </div>
        </template>
      </WhatsAppTemplateParser>
    </div>
  </div>
</template>
