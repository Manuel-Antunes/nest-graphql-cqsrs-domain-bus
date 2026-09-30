<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { dynamicTime } from 'shared/helpers/timeHelper';
import { usePolicy } from 'dashboard/composables/usePolicy';
import {
  isPdfDocument,
  formatDocumentLink,
} from 'shared/helpers/documentHelper';

import CardLayout from 'dashboard/components-next/CardLayout.vue';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';

const props = defineProps({
  id: {
    type: Number,
    required: true,
  },
  name: {
    type: String,
    default: '',
  },
  assistant: {
    type: Object,
    default: () => ({}),
  },
  externalLink: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Number,
    required: true,
  },
});

const emit = defineEmits(['action']);
const { checkPermissions } = usePolicy();

const { t } = useI18n();

const isOpen = ref(false);

const menuItems = computed(() => {
  const allOptions = [
    {
      label: t('CAPTAIN.DOCUMENTS.OPTIONS.VIEW_RELATED_RESPONSES'),
      value: 'viewRelatedQuestions',
      action: 'viewRelatedQuestions',
      icon: 'i-ph-tree-view-duotone',
    },
  ];

  if (checkPermissions(['administrator'])) {
    allOptions.push({
      label: t('CAPTAIN.DOCUMENTS.OPTIONS.DELETE_DOCUMENT'),
      value: 'delete',
      action: 'delete',
      icon: 'i-lucide-trash',
    });
  }

  return allOptions;
});

const createdAt = computed(() => dynamicTime(props.createdAt));

const displayLink = computed(() => formatDocumentLink(props.externalLink));
const linkIcon = computed(() =>
  isPdfDocument(props.externalLink) ? 'i-ph-file-pdf' : 'i-ph-link-simple'
);

const handleAction = ({ action, value }) => {
  isOpen.value = false;
  emit('action', { action, value, id: props.id });
};
</script>

<template>
  <CardLayout>
    <div class="flex gap-1 justify-between w-full">
      <span class="text-base text-n-slate-12 line-clamp-1">
        {{ name }}
      </span>
      <div class="flex gap-2 items-center">
        <Popover v-model:open="isOpen">
          <PopoverTrigger as-child>
            <Button variant="outline" size="icon">
              <Icon icon="i-lucide-ellipsis-vertical" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="end"
            class="flex flex-col p-1 w-auto min-w-36"
          >
            <Button
              v-for="item in menuItems"
              :key="item.value"
              variant="ghost"
              class="justify-start"
              :class="
                item.action === 'delete'
                  ? 'text-destructive hover:text-destructive'
                  : ''
              "
              :disabled="item.disabled"
              @click="handleAction(item)"
            >
              <Icon
                v-if="item.icon"
                :icon="item.icon"
                class="size-3.5 flex-shrink-0"
              />
              <span v-if="item.emoji" class="flex-shrink-0">{{
                item.emoji
              }}</span>
              {{ item.label }}
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
    <div class="flex gap-4 justify-between items-center w-full">
      <span
        class="flex gap-1 items-center text-sm truncate shrink-0 text-n-slate-11"
      >
        <i class="i-woot-captain" />
        {{ assistant?.name || '' }}
      </span>
      <span
        class="flex flex-1 gap-1 justify-start items-center text-sm truncate text-n-slate-11"
      >
        <i :class="linkIcon" class="shrink-0" />
        <span class="truncate">{{ displayLink }}</span>
      </span>
      <div class="text-sm shrink-0 text-n-slate-11 line-clamp-1">
        {{ createdAt }}
      </div>
    </div>
  </CardLayout>
</template>
