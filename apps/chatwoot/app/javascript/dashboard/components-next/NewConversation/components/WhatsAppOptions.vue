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
import WhatsappTemplate from './WhatsappTemplate.vue';

const props = defineProps({
  inboxId: {
    type: Number,
    required: true,
  },
});

const emit = defineEmits(['sendMessage']);

const { t } = useI18n();
const getFilteredWhatsAppTemplates = useMapGetter(
  'inboxes/getFilteredWhatsAppTemplates'
);
const inboxesUiFlags = useMapGetter('inboxes/getUIFlags');

const searchQuery = ref('');
const selectedTemplate = ref(null);
const isOpen = ref(false);

// Gates the trigger while ComposeConversation's on-open refetch is in flight,
// so an agent can't open the picker before a stale template list is refreshed.
const isRefreshingTemplates = computed(() => inboxesUiFlags.value.isFetching);

const whatsAppTemplateMessages = computed(() => {
  return getFilteredWhatsAppTemplates.value(props.inboxId);
});

const filteredTemplates = computed(() => {
  return whatsAppTemplateMessages.value.filter(template =>
    template.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

const getTemplateBody = template => {
  return template.components.find(component => component.type === 'BODY').text;
};

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
        :disabled="!!selectedTemplate || isRefreshingTemplates"
        class="!text-xs font-medium"
      >
        <Icon icon="i-ri-whatsapp-line" />
        {{ t('COMPOSE_NEW_CONVERSATION.FORM.WHATSAPP_OPTIONS.LABEL') }}
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
            <Icon icon="i-lucide-search" class="size-4 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            v-model="searchQuery"
            type="search"
            :placeholder="
              t(
                'COMPOSE_NEW_CONVERSATION.FORM.WHATSAPP_OPTIONS.SEARCH_PLACEHOLDER'
              )
            "
          />
        </InputGroup>
        <div
          v-for="template in filteredTemplates"
          :key="template.id"
          class="flex flex-col gap-2 p-2 w-full rounded-lg cursor-pointer dark:hover:bg-n-alpha-3 hover:bg-n-alpha-1"
          @click="handleTemplateClick(template)"
        >
          <span class="text-sm text-n-slate-12">{{ template.name }}</span>
          <p class="mb-0 text-xs leading-5 text-n-slate-11 line-clamp-2">
            {{ getTemplateBody(template) }}
          </p>
        </div>
        <template v-if="filteredTemplates.length === 0">
          <p class="pt-2 w-full text-sm text-n-slate-11">
            {{
              t('COMPOSE_NEW_CONVERSATION.FORM.WHATSAPP_OPTIONS.EMPTY_STATE')
            }}
          </p>
        </template>
      </div>
      <WhatsappTemplate
        v-else
        :template="selectedTemplate"
        @send-message="handleSendMessage"
        @back="handleBack"
      />
    </PopoverContent>
  </Popover>
</template>
