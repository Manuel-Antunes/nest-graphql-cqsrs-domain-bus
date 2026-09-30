<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  subDays,
  subMonths,
  subYears,
  startOfDay,
  endOfDay,
  format,
  getUnixTime,
  fromUnixTime,
} from 'date-fns';
import { DATE_RANGE_TYPES } from '../helpers/searchHelper';

import { Button } from 'dashboard/components-next/ui/button';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from 'dashboard/components-next/ui/popover';
import { DatePicker } from 'dashboard/components-next/ui/date-picker';

const emit = defineEmits(['change']);
const modelValue = defineModel({
  type: Object,
  default: () => ({ type: null, from: null, to: null }),
});

const { t } = useI18n();
const showDropdown = ref(false);

const customFrom = ref('');
const customTo = ref('');
const rangeType = ref(DATE_RANGE_TYPES.BETWEEN);

// Calculate min date (90 days ago) for date inputs
const minDate = computed(() => format(subDays(new Date(), 90), 'yyyy-MM-dd'));
const maxDate = computed(() => format(new Date(), 'yyyy-MM-dd'));

// Check if both custom date inputs have values
const hasCustomDates = computed(() => customFrom.value && customTo.value);

const DATE_FILTER_ACTIONS = {
  PRESET: 'preset',
  SELECT: 'select',
};

const PRESET_RANGES = computed(() => [
  {
    label: t('SEARCH.DATE_RANGE.LAST_7_DAYS'),
    value: DATE_RANGE_TYPES.LAST_7_DAYS,
    days: 7,
  },
  {
    label: t('SEARCH.DATE_RANGE.LAST_30_DAYS'),
    value: DATE_RANGE_TYPES.LAST_30_DAYS,
    days: 30,
  },
  {
    label: t('SEARCH.DATE_RANGE.LAST_60_DAYS'),
    value: DATE_RANGE_TYPES.LAST_60_DAYS,
    days: 60,
  },
  {
    label: t('SEARCH.DATE_RANGE.LAST_90_DAYS'),
    value: DATE_RANGE_TYPES.LAST_90_DAYS,
    days: 90,
  },
]);

const computeDateRange = config => {
  const end = endOfDay(new Date());
  let start;

  if (config.days) {
    start = startOfDay(subDays(end, config.days));
  } else if (config.months) {
    start = startOfDay(subMonths(end, config.months));
  } else {
    start = startOfDay(subYears(end, config.years));
  }

  return { type: config.value, from: getUnixTime(start), to: getUnixTime(end) };
};

const selectedValue = computed(() => {
  const { from, to, type } = modelValue.value || {};
  if (!from && !to && !type) return '';
  return type || DATE_RANGE_TYPES.CUSTOM;
});

const menuItems = computed(() =>
  PRESET_RANGES.value.map(item => ({
    ...item,
    action: DATE_FILTER_ACTIONS.PRESET,
    isSelected: selectedValue.value === item.value,
  }))
);

const applySelection = ({ type, from, to }) => {
  const newValue = { type, from, to };
  modelValue.value = newValue;
  emit('change', newValue);
};

const clearFilter = () => {
  applySelection({ type: null, from: null, to: null });
  customFrom.value = '';
  customTo.value = '';
  showDropdown.value = false;
};

const handlePresetAction = item => {
  if (selectedValue.value === item.value) {
    clearFilter();
    return;
  }
  customFrom.value = '';
  customTo.value = '';
  applySelection(computeDateRange(item));
  showDropdown.value = false;
};

const applyCustomRange = () => {
  const customFromDate = customFrom.value
    ? startOfDay(new Date(customFrom.value))
    : null;
  const customToDate = customTo.value
    ? endOfDay(new Date(customTo.value))
    : null;

  // Only BETWEEN mode - require both dates
  if (customFromDate && customToDate) {
    applySelection({
      type: DATE_RANGE_TYPES.BETWEEN,
      from: getUnixTime(customFromDate),
      to: getUnixTime(customToDate),
    });
    showDropdown.value = false;
  }
};

const clearCustomRange = () => {
  customFrom.value = '';
  customTo.value = '';
};

const formatDate = timestamp => format(fromUnixTime(timestamp), 'MMM d, yyyy'); // (e.g., "Jan 15, 2024")

const selectedLabel = computed(() => {
  const prefix = t('SEARCH.DATE_RANGE.TIME_RANGE');
  if (!selectedValue.value) return prefix;

  // Check if it's a preset
  const preset = PRESET_RANGES.value.find(p => p.value === selectedValue.value);
  if (preset) return `${prefix}: ${preset.label}`;

  // Custom range - only BETWEEN mode with both dates
  const { from, to } = modelValue.value;
  if (from && to) return `${prefix}: ${formatDate(from)} - ${formatDate(to)}`;

  return `${prefix}: ${t('SEARCH.DATE_RANGE.CUSTOM_RANGE')}`;
});

const CUSTOM_RANGE_TYPES = [DATE_RANGE_TYPES.BETWEEN, DATE_RANGE_TYPES.CUSTOM];

const onUpdateOpen = val => {
  if (val) {
    const { type, from, to } = modelValue.value || {};

    rangeType.value = CUSTOM_RANGE_TYPES.includes(type)
      ? type
      : DATE_RANGE_TYPES.BETWEEN;

    if (CUSTOM_RANGE_TYPES.includes(type)) {
      try {
        customFrom.value = from ? format(fromUnixTime(from), 'yyyy-MM-dd') : '';
        customTo.value = to ? format(fromUnixTime(to), 'yyyy-MM-dd') : '';
      } catch {
        customFrom.value = '';
        customTo.value = '';
      }
    } else {
      customFrom.value = '';
      customTo.value = '';
    }
  }
  showDropdown.value = val;
};
</script>

<template>
  <Popover :open="showDropdown" @update:open="onUpdateOpen">
    <PopoverTrigger as-child>
      <Button
        :variant="showDropdown ? 'outline' : 'default'"
        class="max-w-full"
      >
        <span class="truncate">{{ selectedLabel }}</span>
        <Icon icon="i-lucide-chevron-down" class="ml-1 shrink-0" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-64">
      <button
        v-for="item in menuItems"
        :key="item.value"
        type="button"
        class="inline-flex items-center justify-between w-full h-8 min-w-0 gap-2 px-2 py-1.5 text-sm cursor-pointer rounded-lg outline-none transition-colors hover:bg-n-alpha-1 dark:hover:bg-n-alpha-2 text-n-slate-12"
        @click="handlePresetAction(item)"
      >
        <span>{{ item.label }}</span>
        <span
          v-if="item.isSelected"
          class="i-lucide-check size-3.5 flex-shrink-0 text-n-brand"
        />
      </button>
      <div class="h-px bg-n-strong my-1" />
      <div class="flex flex-col gap-2 px-1">
        <div class="flex items-center justify-between gap-2 h-9">
          <span class="text-sm text-n-slate-11">
            {{ t('SEARCH.DATE_RANGE.CUSTOM_RANGE') }}
          </span>
          <span class="text-sm text-n-slate-12">
            {{ t('SEARCH.DATE_RANGE.CREATED_BETWEEN') }}
          </span>
        </div>

        <DatePicker
          v-model="customFrom"
          :min="minDate"
          :max="customTo || maxDate"
        />

        <div class="flex items-center gap-3 h-5">
          <div class="flex-1 h-px bg-n-weak" />
          <span class="text-sm text-n-slate-11">
            {{ t('SEARCH.DATE_RANGE.AND') }}
          </span>
          <div class="flex-1 h-px bg-n-weak" />
        </div>

        <DatePicker
          v-model="customTo"
          :min="customFrom || minDate"
          :max="maxDate"
        />

        <div class="flex items-center gap-2 mt-2">
          <Button
            variant="outline"
            :disabled="!hasCustomDates"
            class="flex-1 justify-center"
            @click="clearCustomRange"
          >
            {{ t('SEARCH.DATE_RANGE.CLEAR_FILTER') }}
          </Button>
          <Button
            variant="default"
            :disabled="!hasCustomDates"
            class="flex-1 justify-center"
            @click="applyCustomRange"
          >
            {{ t('SEARCH.DATE_RANGE.APPLY') }}
          </Button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
