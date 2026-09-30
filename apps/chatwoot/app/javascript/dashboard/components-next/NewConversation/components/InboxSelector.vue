<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { generateLabelForContactableInboxesList } from 'dashboard/components-next/NewConversation/helpers/composeConversationHelper.js';

import { Button } from 'dashboard/components-next/ui/button';
import { Spinner } from 'dashboard/components-next/ui/spinner';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';

const props = defineProps({
  targetInbox: {
    type: Object,
    default: null,
  },
  selectedContact: {
    type: Object,
    default: null,
  },
  showInboxesDropdown: {
    type: Boolean,
    required: true,
  },
  contactableInboxesList: {
    type: Array,
    default: () => [],
  },
  hasErrors: {
    type: Boolean,
    default: false,
  },
  isFetchingInboxes: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  'updateInbox',
  'toggleDropdown',
  'handleInboxAction',
]);

const { t } = useI18n();

const targetInboxLabel = computed(() => {
  return generateLabelForContactableInboxesList(props.targetInbox);
});

const localOpen = computed({
  get: () => props.showInboxesDropdown,
  set: val => emit('toggleDropdown', val),
});
</script>

<template>
  <div
    class="flex items-center flex-1 w-full gap-3 px-4 py-3 overflow-y-visible"
  >
    <label class="mb-0.5 text-sm font-medium text-n-slate-11 whitespace-nowrap">
      {{ t('COMPOSE_NEW_CONVERSATION.FORM.INBOX_SELECTOR.LABEL') }}
    </label>
    <div
      v-if="targetInbox"
      class="flex items-center gap-1.5 rounded-md bg-n-alpha-2 truncate ltr:pl-3 rtl:pr-3 ltr:pr-1 rtl:pl-1 h-7 min-w-0"
    >
      <span class="text-sm truncate text-n-slate-12">
        {{ targetInboxLabel }}
      </span>
      <Button variant="ghost" size="icon" @click="emit('updateInbox', null)">
        <Icon icon="i-lucide-x" />
      </Button>
    </div>
    <Spinner v-else-if="isFetchingInboxes" class="size-4" />
    <Popover
      v-else-if="contactableInboxesList?.length > 0"
      v-model:open="localOpen"
    >
      <PopoverTrigger as-child>
        <Button
          variant="link"
          :class="hasErrors ? 'text-destructive' : ''"
          :disabled="!selectedContact"
          class="hover:!no-underline"
        >
          {{ t('COMPOSE_NEW_CONVERSATION.FORM.INBOX_SELECTOR.BUTTON') }}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        class="flex flex-col p-1 w-auto min-w-36"
      >
        <Button
          v-for="item in contactableInboxesList"
          :key="item.value"
          variant="ghost"
          class="justify-start"
          :class="
            item.action === 'delete'
              ? 'text-destructive hover:text-destructive'
              : ''
          "
          :disabled="item.disabled"
          @click="
            () => {
              emit('toggleDropdown', false);
              emit('handleInboxAction', item);
            }
          "
        >
          <Icon
            v-if="item.icon"
            :icon="item.icon"
            class="size-3.5 flex-shrink-0"
          />
          <span v-if="item.emoji" class="flex-shrink-0">{{ item.emoji }}</span>
          {{ item.label }}
        </Button>
      </PopoverContent>
    </Popover>
  </div>
</template>
