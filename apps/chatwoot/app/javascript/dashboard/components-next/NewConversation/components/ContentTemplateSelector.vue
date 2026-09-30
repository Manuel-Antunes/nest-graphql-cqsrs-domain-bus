<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';

import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Button } from 'dashboard/components-next/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';
import ContentTemplateForm from './ContentTemplateForm.vue';

const props = defineProps({
  inboxId: {
    type: Number,
    required: true,
  },
});

const emit = defineEmits(['sendMessage']);

const { t } = useI18n();
const inbox = useMapGetter('inboxes/getInbox');

const searchQuery = ref('');
const selectedTemplate = ref(null);
const showTemplatesMenu = ref(false);

const contentTemplates = computed(() => {
  const inboxData = inbox.value(props.inboxId);
  return inboxData?.content_templates?.templates || [];
});

const filteredTemplates = computed(() => {
  return contentTemplates.value.filter(
    template =>
      template.friendly_name
        .toLowerCase()
        .includes(searchQuery.value.toLowerCase()) &&
      template.status === 'approved'
  );
});

const handleTriggerClick = () => {
  searchQuery.value = '';
  showTemplatesMenu.value = !showTemplatesMenu.value;
};

const handleTemplateClick = template => {
  selectedTemplate.value = template;
  showTemplatesMenu.value = false;
};

const handleBack = () => {
  selectedTemplate.value = null;
  showTemplatesMenu.value = true;
};

const handleSendMessage = template => {
  emit('sendMessage', template);
  selectedTemplate.value = null;
};
</script>

<template>
  <div class="relative">
    <Button
      variant="outline"
      :disabled="selectedTemplate"
      class="!text-xs font-medium"
      @click="handleTriggerClick"
    >
      <Icon icon="i-ph-whatsapp-logo" />
      {{ t('COMPOSE_NEW_CONVERSATION.FORM.TWILIO_OPTIONS.LABEL') }}
    </Button>
    <div
      v-if="showTemplatesMenu"
      class="absolute top-full mt-1.5 max-h-96 overflow-y-auto ltr:left-0 rtl:right-0 flex flex-col gap-2 p-4 items-center w-[21.875rem] h-auto bg-n-solid-2 border border-n-strong shadow-sm rounded-lg"
    >
      <InputGroup class="w-full">
        <InputGroupAddon>
          <Icon icon="i-lucide-search" class="text-muted-foreground size-4" />
        </InputGroupAddon>
        <InputGroupInput
          v-model="searchQuery"
          type="search"
          :placeholder="
            t('COMPOSE_NEW_CONVERSATION.FORM.TWILIO_OPTIONS.SEARCH_PLACEHOLDER')
          "
        />
      </InputGroup>
      <div
        v-for="template in filteredTemplates"
        :key="template.content_sid"
        tabindex="0"
        class="flex flex-col gap-2 p-2 w-full rounded-lg cursor-pointer dark:hover:bg-n-alpha-3 hover:bg-n-alpha-1"
        @click="handleTemplateClick(template)"
      >
        <div class="flex justify-between items-center">
          <span class="text-sm text-n-slate-12">{{
            template.friendly_name
          }}</span>
        </div>
        <p class="mb-0 text-xs leading-5 text-n-slate-11 line-clamp-2">
          {{ template.body || t('CONTENT_TEMPLATES.PICKER.NO_CONTENT') }}
        </p>
      </div>
      <template v-if="filteredTemplates.length === 0">
        <p class="pt-2 w-full text-sm text-n-slate-11">
          {{ t('COMPOSE_NEW_CONVERSATION.FORM.TWILIO_OPTIONS.EMPTY_STATE') }}
        </p>
      </template>
    </div>
    <ContentTemplateForm
      v-if="selectedTemplate"
      :template="selectedTemplate"
      @send-message="handleSendMessage"
      @back="handleBack"
    />
  </div>
</template>
