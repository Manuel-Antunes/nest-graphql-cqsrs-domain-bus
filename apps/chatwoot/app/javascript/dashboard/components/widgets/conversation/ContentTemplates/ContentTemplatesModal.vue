<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import TemplatesPicker from './ContentTemplatesPicker.vue';
import TemplateParser from '../../../../components-next/content-templates/ContentTemplateParser.vue';
import { Button } from 'dashboard/components-next/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from 'dashboard/components-next/ui/dialog';

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
  inboxId: {
    type: Number,
    default: undefined,
  },
});

const emit = defineEmits(['onSend', 'cancel', 'update:show']);

const { t } = useI18n();

const selectedContentTemplate = ref(null);

const localShow = computed({
  get() {
    return props.show;
  },
  set(value) {
    emit('update:show', value);
  },
});

const modalHeaderContent = computed(() => {
  return selectedContentTemplate.value
    ? t('CONTENT_TEMPLATES.MODAL.TEMPLATE_SELECTED_SUBTITLE', {
        templateName: selectedContentTemplate.value.friendly_name,
      })
    : t('CONTENT_TEMPLATES.MODAL.SUBTITLE');
});

const pickTemplate = template => {
  selectedContentTemplate.value = template;
};

const onResetTemplate = () => {
  selectedContentTemplate.value = null;
};

const onSendMessage = message => {
  emit('onSend', message);
};

const onClose = () => {
  emit('cancel');
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
        <DialogTitle>{{ $t('CONTENT_TEMPLATES.MODAL.TITLE') }}</DialogTitle>
        <DialogDescription>{{ modalHeaderContent }}</DialogDescription>
      </DialogHeader>
      <div class="px-8 py-6 row">
        <TemplatesPicker
          v-if="!selectedContentTemplate"
          :inbox-id="inboxId"
          @on-select="pickTemplate"
        />
        <TemplateParser
          v-else
          :template="selectedContentTemplate"
          @reset-template="onResetTemplate"
          @send-message="onSendMessage"
        >
          <template #actions="{ sendMessage, resetTemplate, disabled }">
            <div class="flex gap-2 mt-6">
              <Button variant="outline" class="flex-1" @click="resetTemplate">
                {{ t('CONTENT_TEMPLATES.PARSER.GO_BACK_LABEL') }}
              </Button>
              <Button class="flex-1" :disabled="disabled" @click="sendMessage">
                {{ t('CONTENT_TEMPLATES.PARSER.SEND_MESSAGE_LABEL') }}
              </Button>
            </div>
          </template>
        </TemplateParser>
      </div>
    </DialogContent>
  </Dialog>
</template>
