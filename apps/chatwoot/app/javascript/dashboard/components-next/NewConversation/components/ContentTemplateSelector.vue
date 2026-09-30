<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';

import Icon from 'dashboard/components-next/icon/Icon.vue';
import { Button } from 'dashboard/components-next/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from 'dashboard/components-next/ui/input-group';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
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
const isOpen = ref(false);

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

watch(isOpen, open => {
  if (open) searchQuery.value = '';
  selectedTemplate.value = null;
});

const handleTemplateClick = template => {
  selectedTemplate.value = template;
};

const handleBack = () => {
  selectedTemplate.value = null;
};

const handleSendMessage = template => {
  emit('sendMessage', template);
  isOpen.value = false;
};
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        :disabled="!!selectedTemplate"
        class="!text-xs font-medium"
      >
        <Icon icon="i-ph-whatsapp-logo" />
        {{ t('COMPOSE_NEW_CONVERSATION.FORM.TWILIO_OPTIONS.LABEL') }}
      </Button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      class="w-auto p-0 max-h-[30rem] overflow-y-auto bg-n-solid-2 border-n-strong"
    >
      <div
        v-if="!selectedTemplate"
        class="flex flex-col gap-2 p-4 items-center w-[21.875rem]"
      >
        <InputGroup class="w-full">
          <InputGroupAddon>
            <Icon icon="i-lucide-search" class="text-muted-foreground size-4" />
          </InputGroupAddon>
          <InputGroupInput
            v-model="searchQuery"
            type="search"
            :placeholder="
              t(
                'COMPOSE_NEW_CONVERSATION.FORM.TWILIO_OPTIONS.SEARCH_PLACEHOLDER'
              )
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
        v-else
        :template="selectedTemplate"
        @send-message="handleSendMessage"
        @back="handleBack"
      />
    </PopoverContent>
  </Popover>
</template>
