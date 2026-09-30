<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUISettings } from 'dashboard/composables/useUISettings';
import { useMapGetter, useStore } from 'dashboard/composables/store.js';
import wootConstants from 'dashboard/constants/globals';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from 'dashboard/components-next/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'dashboard/components-next/ui/select';
import Label from 'next/ui/label/Label.vue';

defineProps({
  isOnExpandedLayout: {
    type: Boolean,
    required: true,
  },
});

const emit = defineEmits(['changeFilter']);

const store = useStore();
const { t } = useI18n();

const { updateUISettings } = useUISettings();

const chatStatusFilter = useMapGetter('getChatStatusFilter');
const chatSortFilter = useMapGetter('getChatSortFilter');

const currentStatusFilter = computed(() => {
  return chatStatusFilter.value || wootConstants.STATUS_TYPE.OPEN;
});

const currentSortBy = computed(() => {
  return (
    chatSortFilter.value || wootConstants.SORT_BY_TYPE.LAST_ACTIVITY_AT_DESC
  );
});

const chatStatusOptions = computed(() => [
  {
    label: t('CHAT_LIST.CHAT_STATUS_FILTER_ITEMS.open.TEXT'),
    value: 'open',
  },
  {
    label: t('CHAT_LIST.CHAT_STATUS_FILTER_ITEMS.resolved.TEXT'),
    value: 'resolved',
  },
  {
    label: t('CHAT_LIST.CHAT_STATUS_FILTER_ITEMS.pending.TEXT'),
    value: 'pending',
  },
  {
    label: t('CHAT_LIST.CHAT_STATUS_FILTER_ITEMS.snoozed.TEXT'),
    value: 'snoozed',
  },
  {
    label: t('CHAT_LIST.CHAT_STATUS_FILTER_ITEMS.all.TEXT'),
    value: 'all',
  },
]);

const chatSortOptions = computed(() => [
  {
    label: t('CHAT_LIST.SORT_ORDER_ITEMS.last_activity_at_asc.TEXT'),
    value: 'last_activity_at_asc',
  },
  {
    label: t('CHAT_LIST.SORT_ORDER_ITEMS.last_activity_at_desc.TEXT'),
    value: 'last_activity_at_desc',
  },
  {
    label: t('CHAT_LIST.SORT_ORDER_ITEMS.created_at_desc.TEXT'),
    value: 'created_at_desc',
  },
  {
    label: t('CHAT_LIST.SORT_ORDER_ITEMS.created_at_asc.TEXT'),
    value: 'created_at_asc',
  },
  {
    label: t('CHAT_LIST.SORT_ORDER_ITEMS.priority_desc.TEXT'),
    value: 'priority_desc',
  },
  {
    label: t('CHAT_LIST.SORT_ORDER_ITEMS.priority_asc.TEXT'),
    value: 'priority_asc',
  },
  {
    label: t('CHAT_LIST.SORT_ORDER_ITEMS.waiting_since_asc.TEXT'),
    value: 'waiting_since_asc',
  },
  {
    label: t('CHAT_LIST.SORT_ORDER_ITEMS.waiting_since_desc.TEXT'),
    value: 'waiting_since_desc',
  },
]);

const activeChatStatusLabel = computed(
  () =>
    chatStatusOptions.value.find(m => m.value === chatStatusFilter.value)
      ?.label || ''
);

const activeChatSortLabel = computed(
  () =>
    chatSortOptions.value.find(m => m.value === chatSortFilter.value)?.label ||
    ''
);

const saveSelectedFilter = (type, value) => {
  updateUISettings({
    conversations_filter_by: {
      status: type === 'status' ? value : currentStatusFilter.value,
      order_by: type === 'sort' ? value : currentSortBy.value,
    },
  });
};

const handleStatusChange = value => {
  emit('changeFilter', value, 'status');
  store.dispatch('setChatStatusFilter', value);
  saveSelectedFilter('status', value);
};

const handleSortChange = value => {
  emit('changeFilter', value, 'sort');
  store.dispatch('setChatSortFilter', value);
  saveSelectedFilter('sort', value);
};
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        v-tooltip.right="$t('CHAT_LIST.SORT_TOOLTIP_LABEL')"
        variant="ghost"
        size="icon"
      >
        <Icon :icon="'i-lucide-arrow-up-down'" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      :align="isOnExpandedLayout ? 'end' : 'start'"
      class="flex flex-col gap-2 w-auto max-w-xl"
    >
      <div class="flex items-center justify-between gap-2">
        <Label>
          {{ $t('CHAT_LIST.CHAT_SORT.STATUS') }}
        </Label>
        <Select
          :model-value="chatStatusFilter"
          @update:model-value="handleStatusChange"
        >
          <SelectTrigger>
            <SelectValue :placeholder="activeChatStatusLabel" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem
              v-for="option in chatStatusOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex items-center justify-between gap-2">
        <Label>
          {{ $t('CHAT_LIST.CHAT_SORT.ORDER_BY') }}
        </Label>
        <Select
          :model-value="chatSortFilter"
          @update:model-value="handleSortChange"
        >
          <SelectTrigger>
            <SelectValue :placeholder="activeChatSortLabel" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem
              v-for="option in chatSortOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </PopoverContent>
  </Popover>
</template>
