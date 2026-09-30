<script setup>
import { computed, ref, watch } from 'vue';
import { useNow } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'dashboard/components-next/ui/dropdown-menu';

const props = defineProps({
  statsStartDate: { type: Date, default: null },
});

const modelValue = defineModel({ type: String, default: '7' });

const { t } = useI18n();
const showDropdown = ref(false);

const DAY_RANGES = ['7', '30', '90'];
const DAYS_PER_WEEK = 7;
const RANGE_REFRESH_INTERVAL = 60_000;
const now = useNow({ interval: RANGE_REFRESH_INTERVAL });

const decorate = item => ({
  ...item,
  action: 'select',
  isSelected: item.value === modelValue.value,
});

const menuSections = computed(() => {
  const dayItems = DAY_RANGES.filter(value => {
    const start = new Date(now.value);
    start.setDate(start.getDate() - Number(value));
    return !props.statsStartDate || start >= props.statsStartDate;
  }).map(value =>
    decorate({
      value,
      label: t('CAPTAIN.OVERVIEW.RANGES.LAST_DAYS', { count: value }),
    })
  );
  const thisWeekStart = new Date(now.value);
  thisWeekStart.setHours(0, 0, 0, 0);
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - DAYS_PER_WEEK);
  const weekItems = [
    {
      value: 'this_week',
      label: t('CAPTAIN.OVERVIEW.RANGES.THIS_WEEK'),
      start: thisWeekStart,
    },
    {
      value: 'last_week',
      label: t('CAPTAIN.OVERVIEW.RANGES.LAST_WEEK'),
      start: lastWeekStart,
    },
  ];
  const monthItems = [
    {
      value: 'this_month',
      label: t('CAPTAIN.OVERVIEW.RANGES.THIS_MONTH'),
      start: new Date(now.value.getFullYear(), now.value.getMonth(), 1),
    },
    {
      value: 'last_month',
      label: t('CAPTAIN.OVERVIEW.RANGES.LAST_MONTH'),
      start: new Date(now.value.getFullYear(), now.value.getMonth() - 1, 1),
    },
  ];
  const calendarSections = [weekItems, monthItems].map(items => ({
    items: items
      .filter(
        ({ start }) => !props.statsStartDate || start >= props.statsStartDate
      )
      .map(({ value, label }) => decorate({ value, label })),
  }));
  return [{ items: dayItems }, ...calendarSections].filter(
    section => section.items.length
  );
});

const menuItems = computed(() =>
  menuSections.value.flatMap(section => section.items)
);

const selectedLabel = computed(
  () =>
    menuItems.value.find(item => item.isSelected)?.label ||
    t('CAPTAIN.OVERVIEW.RANGES.INSUFFICIENT_HISTORY')
);

watch(
  menuItems,
  items => {
    if (
      props.statsStartDate &&
      items.length &&
      !items.some(item => item.isSelected)
    ) {
      modelValue.value = items[0].value;
    }
  },
  { immediate: true }
);

const handleAction = ({ value }) => {
  showDropdown.value = false;
  modelValue.value = value;
};
</script>

<template>
  <DropdownMenu v-model:open="showDropdown">
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm" :disabled="!menuItems.length">
        {{ selectedLabel }}
        <Icon icon="i-lucide-chevron-down" class="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-44">
      <template
        v-for="(section, sectionIndex) in menuSections"
        :key="sectionIndex"
      >
        <DropdownMenuSeparator v-if="sectionIndex > 0" />
        <DropdownMenuItem
          v-for="item in section.items"
          :key="item.value"
          @select="handleAction(item)"
        >
          <span class="flex-1 min-w-0 truncate">{{ item.label }}</span>
          <Icon
            v-if="item.isSelected"
            icon="i-lucide-check"
            class="shrink-0 size-4"
          />
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
