<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { dynamicTime } from 'shared/helpers/timeHelper';
import { useExactTimestamp } from 'shared/composables/useExactTimestamp';
import { usePolicy } from 'dashboard/composables/usePolicy';

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
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  updatedAt: {
    type: Number,
    required: true,
  },
});

const emit = defineEmits(['action']);

const exactTimestamp = useExactTimestamp();

const { checkPermissions } = usePolicy();

const { t } = useI18n();

const isOpen = ref(false);

const menuItems = computed(() => {
  const allOptions = [
    {
      label: t('CAPTAIN.ASSISTANTS.OPTIONS.VIEW_CONNECTED_INBOXES'),
      value: 'viewConnectedInboxes',
      action: 'viewConnectedInboxes',
      icon: 'i-lucide-link',
    },
  ];

  if (checkPermissions(['administrator'])) {
    allOptions.push(
      {
        label: t('CAPTAIN.ASSISTANTS.OPTIONS.EDIT_ASSISTANT'),
        value: 'edit',
        action: 'edit',
        icon: 'i-lucide-pencil-line',
      },
      {
        label: t('CAPTAIN.ASSISTANTS.OPTIONS.DELETE_ASSISTANT'),
        value: 'delete',
        action: 'delete',
        icon: 'i-lucide-trash',
      }
    );
  }

  return allOptions;
});

const lastUpdatedAt = computed(() => dynamicTime(props.updatedAt));

const handleAction = ({ action, value }) => {
  isOpen.value = false;
  emit('action', { action, value, id: props.id });
};
</script>

<template>
  <CardLayout>
    <div class="flex justify-between w-full gap-1">
      <h6
        class="text-base font-normal text-n-slate-12 line-clamp-1 hover:underline transition-colors"
      >
        {{ name }}
      </h6>
      <div class="flex items-center gap-2">
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
    <div class="flex items-center justify-between w-full gap-4">
      <span class="text-sm truncate text-n-slate-11">
        {{ description || 'Description not available' }}
      </span>
      <span
        v-tooltip.top="{
          content: exactTimestamp(updatedAt),
          delay: { show: 500, hide: 0 },
        }"
        class="text-sm text-n-slate-11 line-clamp-1 shrink-0"
      >
        {{ lastUpdatedAt }}
      </span>
    </div>
  </CardLayout>
</template>
